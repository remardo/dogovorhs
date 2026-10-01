import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { phoneVariants } from "./_lib/billingImportParser";
import {
  buildTariffFeeByKey,
  collectCompanyConflicts,
  collectMissingContracts,
  normalizeCompanyName,
  type NormalizedCompany,
} from "./_lib/billingImportLogic";
import {
  attributeEmployeeAtPeriod,
  canAttachToCharge,
  expenseKindOf,
  fingerprint,
  normalizeContractNumber,
  roundMoney,
  toIsoDate,
  toPeriodKey,
  type AssignmentInterval,
} from "./_lib/accounting";
import { writeAudit } from "./_lib/audit";

export type ImportRowInput = {
  rowIndex: number;
  phone: string;
  contractNumber: string;
  tariffName: string;
  periodStart: string;
  periodEnd: string;
  month: string;
  amount: number;
  vat: number;
  total: number;
  vatMismatch: boolean;
  tariffFee: number;
  isVatOnly: boolean;
};

export type ContractResolutionInput = {
  contractNumber: string;
  company: { mode: "existing"; id: Id<"companies"> } | { mode: "create"; name: string; inn?: string; kpp?: string; comment?: string; forceCreate?: boolean };
  operator: { mode: "existing"; id: Id<"operators"> } | { mode: "create"; name: string; type?: string; manager?: string; phone?: string; email?: string };
  name?: string;
  type: string;
  status: "active" | "closing";
  startDate: string;
  endDate: string;
  monthlyFee: number;
  simCount: number;
};

export type ApplyParsedInput = {
  id: Id<"billingImports">;
  rows: ImportRowInput[];
  contractResolutions: ContractResolutionInput[];
  simCardActions?: { phone: string; action: "create" | "skip" }[];
  tariffOverrides?: { operatorId: Id<"operators">; tariffName: string; monthlyFee?: number }[];
  vatDistributionKeys?: string[];
};

export type GroupReport = {
  contractNumber: string;
  month: string;
  periodKey: string;
  chargeMode: string;
  chargeId?: string;
  allocatedTotal: number;
  unallocated: number;
  allocations: number;
};

export type ImportAmbiguity = { group: string; reason: string; total: number };

export type ApplyParsedResult =
  | { ok: true; status: "applied"; reconciliation: { groups: GroupReport[]; ambiguities: ImportAmbiguity[]; unallocatedTotal: number } }
  | { ok: false; status: "already_applied" }
  | { ok: false; status: "duplicate_file"; existingImportId: string }
  | { ok: false; status: "needs_confirmation"; companyConflicts: unknown }
  | { ok: false; status: "missing_contracts"; missingContracts: string[] };

function groupKey(contractNumber: string, month: string): string {
  return `${contractNumber}::${month}`;
}

type ScopedContract = {
  doc: Doc<"contracts">;
  ambiguous: boolean;
};

/** Resolve a row contract by number, scoped to a single candidate; never first-match. */
function resolveRowContract(
  contractNumber: string,
  byNorm: Map<string, Doc<"contracts">[]>,
): ScopedContract | null {
  const candidates = byNorm.get(normalizeContractNumber(contractNumber)) ?? [];
  if (candidates.length === 1) return { doc: candidates[0], ambiguous: false };
  if (candidates.length === 0) return null;
  return { doc: candidates[0], ambiguous: true };
}

type ScopedSim = { sim: Doc<"simCards"> | null; ambiguous: boolean; reason?: string };

/** SIM must belong to the row contract's company/operator (and contract when set). */
function resolveRowSim(
  phone: string,
  contract: Doc<"contracts">,
  simsByVariant: Map<string, Doc<"simCards">[]>,
): ScopedSim {
  const variants = phoneVariants(phone);
  const hits = new Map<string, Doc<"simCards">>();
  for (const variant of variants) {
    for (const sim of simsByVariant.get(variant) ?? []) {
      hits.set(`${sim._id}`, sim);
    }
  }
  if (hits.size === 0) return { sim: null, ambiguous: false };
  const matching = [...hits.values()].filter(
    (s) =>
      `${s.companyId}` === `${contract.companyId}` &&
      `${s.operatorId}` === `${contract.operatorId}` &&
      (!s.contractId || `${s.contractId}` === `${contract._id}`),
  );
  if (matching.length === 1) return { sim: matching[0], ambiguous: false };
  if (matching.length === 0) {
    return { sim: null, ambiguous: true, reason: "sim_other_company_or_contract" };
  }
  return { sim: null, ambiguous: true, reason: "several_sims_same_number" };
}

export async function applyParsedCore(
  ctx: MutationCtx,
  args: ApplyParsedInput,
): Promise<ApplyParsedResult> {
  const record = await ctx.db.get(args.id);
  if (!record) throw new Error("Импорт не найден");
  if (record.status === "applied" && !record.voided) {
    return { ok: false, status: "already_applied" };
  }
  if (record.voided) {
    throw new Error("Аннулированный импорт нельзя применять повторно");
  }

  const rows = args.rows;
  const vatDistributionKeys = new Set<string>(args.vatDistributionKeys ?? []);

  const [companies, operators, contracts, tariffs, allImports] = await Promise.all([
    ctx.db.query("companies").collect(),
    ctx.db.query("operators").collect(),
    ctx.db.query("contracts").collect(),
    ctx.db.query("tariffs").collect(),
    ctx.db.query("billingImports").collect(),
  ]);

  // Idempotency by server-calculated content hash (set on the record by the action).
  if (record.fileHash) {
    const dup = allImports.find(
      (i) => `${i._id}` !== `${args.id}` && i.fileHash === record.fileHash && i.status === "applied" && !i.voided,
    );
    if (dup) {
      return { ok: false, status: "duplicate_file", existingImportId: `${dup._id}` };
    }
  }

  const normalizedCompanies: NormalizedCompany<Id<"companies">>[] = companies.map((c) => ({
    id: c._id,
    ...normalizeCompanyName(c.name),
  }));

  const createCompanyRequests = args.contractResolutions.filter(
    (c): c is ContractResolutionInput & { company: { mode: "create"; name: string; inn?: string; kpp?: string; comment?: string; forceCreate?: boolean } } =>
      c.company.mode === "create",
  );
  const companyConflicts = collectCompanyConflicts(createCompanyRequests, normalizedCompanies);
  if (companyConflicts.length) {
    return { ok: false, status: "needs_confirmation", companyConflicts };
  }

  const operatorByName = new Map<string, Doc<"operators">>(
    operators.map((o) => [o.name.toLowerCase().trim(), o]),
  );
  const contractDocs: Doc<"contracts">[] = [...contracts];
  const contractByNumber = new Map<string, Doc<"contracts">>(
    contractDocs.map((c) => [c.number, c]),
  );
  const contractsByNorm = new Map<string, Doc<"contracts">[]>();
  for (const c of contractDocs) {
    const norm = normalizeContractNumber(c.number);
    const list = contractsByNorm.get(norm) ?? [];
    list.push(c);
    contractsByNorm.set(norm, list);
  }
  const tariffByKey = new Map<string, Doc<"tariffs">>(
    tariffs.map((t) => [`${t.operatorId}:${t.name.toLowerCase().trim()}`, t]),
  );

  const resolvedContractNumbers = new Set<string>(args.contractResolutions.map((c) => c.contractNumber));
  const missingContracts = collectMissingContracts(
    rows,
    new Set<string>(contractByNumber.keys()),
    resolvedContractNumbers,
  );
  if (missingContracts.length) {
    return { ok: false, status: "missing_contracts", missingContracts };
  }

  const createdCompanies = new Map<string, Id<"companies">>();
  let contractsCreated = 0;
  let tariffsCreated = 0;
  let simCardsCreated = 0;
  for (const resolution of createCompanyRequests) {
    if (resolution.company.mode !== "create") continue;
    const nameKey = normalizeCompanyName(resolution.company.name).normalized;
    if (createdCompanies.has(nameKey)) continue;
    const companyId = await ctx.db.insert("companies", {
      name: resolution.company.name,
      inn: resolution.company.inn,
      kpp: resolution.company.kpp,
      comment: resolution.company.comment,
      contracts: 0,
      simCards: 0,
      employees: 0,
      monthlyExpense: 0,
      createdAt: Date.now(),
    });
    createdCompanies.set(nameKey, companyId);
  }

  const getCompanyId = (resolution: ContractResolutionInput): Id<"companies"> => {
    if (resolution.company.mode === "existing") return resolution.company.id;
    if (resolution.company.mode !== "create") throw new Error("Некорректная компания");
    const key = normalizeCompanyName(resolution.company.name).normalized;
    const created = createdCompanies.get(key);
    if (created) return created;
    throw new Error(`Не удалось создать компанию: ${resolution.company.name}`);
  };

  const createdOperators = new Map<string, Id<"operators">>();
  for (const resolution of args.contractResolutions) {
    if (resolution.operator.mode === "existing") continue;
    if (resolution.operator.mode !== "create") throw new Error("Некорректный оператор");
    const key = resolution.operator.name.toLowerCase().trim();
    if (createdOperators.has(key)) continue;
    const existing = operatorByName.get(key);
    if (existing) {
      createdOperators.set(key, existing._id);
      continue;
    }
    const operatorId = await ctx.db.insert("operators", {
      name: resolution.operator.name,
      type: resolution.operator.type,
      manager: resolution.operator.manager,
      phone: resolution.operator.phone,
      email: resolution.operator.email,
      contracts: 0,
      simCards: 0,
      createdAt: Date.now(),
    });
    createdOperators.set(key, operatorId);
  }

  const getOperatorId = (resolution: ContractResolutionInput): Id<"operators"> => {
    if (resolution.operator.mode === "existing") return resolution.operator.id;
    if (resolution.operator.mode !== "create") throw new Error("Некорректный оператор");
    const key = resolution.operator.name.toLowerCase().trim();
    const id = createdOperators.get(key);
    if (!id) throw new Error(`Не удалось создать оператора: ${resolution.operator.name}`);
    return id;
  };

  for (const resolution of args.contractResolutions) {
    if (contractByNumber.has(resolution.contractNumber)) continue;
    const companyId = getCompanyId(resolution);
    const operatorId = getOperatorId(resolution);
    const contractId = await ctx.db.insert("contracts", {
      number: resolution.contractNumber,
      name: resolution.name,
      companyId,
      operatorId,
      type: resolution.type,
      serviceCategory: resolution.type,
      normalizedNumber: normalizeContractNumber(resolution.contractNumber),
      status: resolution.status,
      startDate: resolution.startDate,
      endDate: resolution.endDate,
      monthlyFee: resolution.monthlyFee,
      simCount: resolution.simCount,
      createdAt: Date.now(),
    });
    contractsCreated += 1;
    const created: Doc<"contracts"> = {
      _id: contractId,
      _creationTime: Date.now(),
      number: resolution.contractNumber,
      name: resolution.name,
      companyId,
      operatorId,
      type: resolution.type,
      serviceCategory: resolution.type,
      normalizedNumber: normalizeContractNumber(resolution.contractNumber),
      status: resolution.status,
      startDate: resolution.startDate,
      endDate: resolution.endDate,
      monthlyFee: resolution.monthlyFee,
      simCount: resolution.simCount,
      createdAt: Date.now(),
    };
    contractByNumber.set(resolution.contractNumber, created);
    const norm = created.normalizedNumber ?? normalizeContractNumber(resolution.contractNumber);
    const list = contractsByNorm.get(norm) ?? [];
    list.push(created);
    contractsByNorm.set(norm, list);
  }

  const [freshOperators, simCards, allAssignments] = await Promise.all([
    ctx.db.query("operators").collect(),
    ctx.db.query("simCards").collect(),
    ctx.db.query("simAssignments").collect(),
  ]);
  const operatorNameById = new Map<string, string>(freshOperators.map((o) => [`${o._id}`, o.name]));
  const simsByVariant = new Map<string, Doc<"simCards">[]>();
  const simById = new Map<string, Doc<"simCards">>();
  for (const s of simCards) {
    simById.set(`${s._id}`, s);
    for (const variant of phoneVariants(s.number)) {
      const list = simsByVariant.get(variant) ?? [];
      list.push(s);
      simsByVariant.set(variant, list);
    }
  }

  const simCardDecision = new Map<string, "create" | "skip">();
  for (const item of args.simCardActions ?? []) {
    for (const variant of phoneVariants(item.phone)) {
      simCardDecision.set(variant, item.action);
    }
  }

  const tariffFeeByKey = buildTariffFeeByKey(rows, contractByNumber);
  const overrideFees = new Map<string, number>(
    (args.tariffOverrides ?? []).map((t) => [
      `${t.operatorId}:${t.tariffName.toLowerCase().trim()}`,
      t.monthlyFee ?? 0,
    ]),
  );

  for (const row of rows) {
    const scoped = resolveRowContract(row.contractNumber, contractsByNorm);
    const contract = scoped && !scoped.ambiguous ? scoped.doc : contractByNumber.get(row.contractNumber);
    if (!contract || !row.tariffName) continue;
    const tariffKey = `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`;
    if (tariffByKey.has(tariffKey)) continue;
    const monthlyFee = overrideFees.get(tariffKey) ?? tariffFeeByKey.get(tariffKey) ?? 0;
    const tariffId = await ctx.db.insert("tariffs", {
      name: row.tariffName,
      operatorId: contract.operatorId,
      monthlyFee,
      dataLimitGb: undefined,
      minutes: undefined,
      sms: undefined,
      status: "active",
      simCount: 0,
      createdAt: Date.now(),
    });
    tariffsCreated += 1;
    const createdTariff = await ctx.db.get(tariffId);
    if (createdTariff) tariffByKey.set(tariffKey, createdTariff);
  }

  const ambiguities: ImportAmbiguity[] = [];

  for (const row of rows) {
    const scoped = resolveRowContract(row.contractNumber, contractsByNorm);
    if (!scoped) continue;
    if (scoped.ambiguous) {
      ambiguities.push({
        group: groupKey(row.contractNumber, row.month),
        reason: "ambiguous_contract_number",
        total: row.total,
      });
      continue;
    }
    const contract = scoped.doc;
    if (row.isVatOnly) continue;
    if (!row.phone) continue;
    const variants = phoneVariants(row.phone);
    if (!variants.length) continue;
    const resolved = resolveRowSim(row.phone, contract, simsByVariant);
    if (resolved.sim) continue;
    if (resolved.ambiguous) {
      ambiguities.push({
        group: groupKey(row.contractNumber, row.month),
        reason: resolved.reason ?? "ambiguous_sim",
        total: row.total,
      });
      continue;
    }
    if (simCardDecision.get(variants[0]) === "skip") continue;

    const tariffKey = row.tariffName
      ? `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`
      : "";
    const existingTariff = tariffKey ? tariffByKey.get(tariffKey) : undefined;

    const simId = await ctx.db.insert("simCards", {
      number: row.phone,
      normalizedNumber: row.phone.replace(/\D/g, ""),
      companyId: contract.companyId,
      operatorId: contract.operatorId,
      contractId: contract._id,
      status: "active",
      type: row.tariffName || undefined,
      tariffId: existingTariff ? existingTariff._id : undefined,
      createdAt: Date.now(),
    });
    simCardsCreated += 1;
    const createdSim = await ctx.db.get(simId);
    if (createdSim) {
      simById.set(`${simId}`, createdSim);
      for (const variant of variants) {
        const list = simsByVariant.get(variant) ?? [];
        list.push(createdSim);
        simsByVariant.set(variant, list);
      }
    }
  }

  // ---- Charge / allocation accounting per contract+period group ----
  const allExpenses = await ctx.db.query("expenses").collect();
  const groupRows = new Map<string, ImportRowInput[]>();
  for (const row of rows) {
    const key = groupKey(row.contractNumber, row.month);
    const list = groupRows.get(key) ?? [];
    list.push(row);
    groupRows.set(key, list);
  }

  let chargesCreated = 0;
  let chargesAttached = 0;
  let allocationsCreated = 0;
  let unallocatedTotal = 0;
  const groupReports: GroupReport[] = [];
  const assignmentPool: AssignmentInterval[] = allAssignments.map((a) => ({
    simCardId: `${a.simCardId}`,
    employeeId: a.employeeId ? `${a.employeeId}` : undefined,
    assignedAt: a.assignedAt,
    unassignedAt: a.unassignedAt,
  }));

  for (const [key, group] of groupRows) {
    const [contractNumber] = key.split("::");
    const scoped = resolveRowContract(contractNumber, contractsByNorm);
    if (!scoped || scoped.ambiguous) {
      throw new Error(`Неоднозначный договор ${contractNumber}: выберите компанию и оператора до импорта`);
    }
    const contract = scoped.doc;
    const month = group[0].month;
    const periodKey = toPeriodKey(month) || toPeriodKey(group[0].periodEnd);
    if (!periodKey) {
      throw new Error(`Не определён период услуг для ${contractNumber}`);
    }
    const distributed = vatDistributionKeys.has(key);
    // VAT-only rows are retained unless actually distributed onto base rows.
    const baseRows = group.filter((r) => !r.isVatOnly);
    const vatOnlyRows = group.filter((r) => r.isVatOnly);
    const effectiveRows = distributed ? baseRows : [...baseRows, ...vatOnlyRows];
    if (baseRows.length === 0 && !distributed) {
      ambiguities.push({ group: key, reason: "vat_only_no_base_rows", total: roundMoney(vatOnlyRows.reduce((a, r) => a + r.total, 0)) });
    }
    if (effectiveRows.some(r=>r.amount<0 || r.vat<0 || r.total<0 || !Number.isFinite(r.total) || Math.abs(roundMoney(r.amount+r.vat)-r.total)>.01)) throw new Error("Некорректная сумма детализации; требуется сверка");
    const groupTotal = roundMoney(effectiveRows.reduce((acc, r) => acc + r.total, 0));
    const groupAmount = roundMoney(effectiveRows.reduce((acc, r) => acc + r.amount, 0));
    const groupVat = roundMoney(effectiveRows.reduce((acc, r) => acc + r.vat, 0));
    const candidates = allExpenses.filter(
      (e) =>
        e.kind !== "allocation" &&
        !e.voided &&
        e.status !== "cancelled" &&
        ((e.contractId && `${e.contractId}` === `${contract._id}`) ||
          (!e.contractId && e.companyId === contract.companyId && e.contract === contractNumber && e.operator === operatorNameById.get(`${contract.operatorId}`))) &&
        (e.periodKey ?? toPeriodKey(e.month)) === periodKey,
    );
    const decision = canAttachToCharge(
      candidates.map((c) => ({ id: `${c._id}`, total: c.total ?? c.amount + (c.vat ?? 0) })),
      groupTotal,
    );
    let chargeId: string | undefined;
    let chargeMode: string;
    let chargeInvoiceId: Id<"invoices"> | undefined;
    if (decision.ok && decision.chargeId) {
      chargeId = decision.chargeId;
      chargeMode = "attached";
      chargesAttached += 1;
      const charge = candidates.find((c) => `${c._id}` === chargeId);
      chargeInvoiceId = charge?.invoiceId;
    } else if (decision.reason === "no_charge") {
      const operatorName = operatorNameById.get(`${contract.operatorId}`) ?? "Оператор";
      const serviceCategory = contract.serviceCategory ?? contract.type;
      const created = await ctx.db.insert("expenses", {
        companyId: contract.companyId,
        type: serviceCategory,
        serviceCategory,
        amount: groupAmount,
        month,
        periodKey,
        periodStart: group[0].periodStart,
        periodEnd: group[0].periodEnd,
        contract: contractNumber,
        contractId: contract._id,
        operator: operatorName,
        importId: args.id,
        vat: groupVat,
        total: groupTotal,
        status: "confirmed",
        hasDocument: true,
        kind: "charge",
        createdAt: Date.now(),
      });
      const createdCharge = await ctx.db.get(created);
      if (createdCharge) allExpenses.push(createdCharge);
      chargeId = `${created}`;
      chargeMode = "created";
      chargesCreated += 1;
    } else {
      throw new Error(`Требуется сверка начисления ${contractNumber}: ${decision.reason}`);
    }

    if (allExpenses.some((e) => !e.voided && e.status !== "cancelled" && e.kind === "allocation" && `${e.parentExpenseId}` === chargeId)) {
      throw new Error(`Начисление ${contractNumber} уже содержит детализацию. Требуется сверка перед повторным импортом.`);
    }
    let allocated = 0;
    for (const row of effectiveRows) {
      const operatorName = operatorNameById.get(`${contract.operatorId}`) ?? "Оператор";
      const serviceCategory = contract.serviceCategory ?? contract.type;
      let simNumber: string | undefined;
      let simCardId: Id<"simCards"> | undefined;
      if (!row.isVatOnly && row.phone) {
        const resolved = resolveRowSim(row.phone, contract, simsByVariant);
        if (resolved.sim) {
          simNumber = resolved.sim.number;
          simCardId = resolved.sim._id;
        } else if (!resolved.ambiguous) {
          simNumber = row.phone;
        } else {
          ambiguities.push({ group: key, reason: resolved.reason ?? "ambiguous_sim", total: row.total });
          simNumber = row.phone;
        }
      }
      const tariffKey = row.tariffName
        ? `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`
        : "";
      const tariff = tariffKey ? tariffByKey.get(tariffKey) : undefined;
      let employeeId: Id<"employees"> | undefined;
      if (simCardId) {
        const startIso = toIsoDate(row.periodStart);
        const endIso = toIsoDate(row.periodEnd);
        const attribution =
          startIso && endIso
            ? attributeEmployeeAtPeriod(assignmentPool, `${simCardId}`, startIso, endIso)
            : { ambiguous: true, reason: "unknown_period" as const };
        if (attribution.employeeId) {
          const owner = await ctx.db.get(attribution.employeeId as Id<"employees">);
          if (owner) employeeId = owner._id;
        } else if (attribution.ambiguous) {
          ambiguities.push({ group: key, reason: attribution.reason ?? "unknown_owner", total: row.total });
        }
      }
      await ctx.db.insert("expenses", {
        companyId: contract.companyId,
        type: serviceCategory,
        serviceCategory,
        tariffId: tariff ? tariff._id : undefined,
        tariffName: row.tariffName || undefined,
        amount: row.amount,
        month,
        periodKey,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        simNumber,
        simCardId,
        employeeId,
        contract: row.contractNumber,
        contractId: contract._id,
        operator: operatorName,
        importId: args.id,
        invoiceId: chargeInvoiceId,
        parentExpenseId: chargeId as Id<"expenses"> | undefined,
        vat: row.vat,
        total: row.total,
        status: "confirmed",
        hasDocument: true,
        kind: "allocation",
        description: row.tariffName || "Строка детализации",
        basis: `Файл ${record.fileName}, строка ${row.rowIndex}`,
        fingerprint: fingerprint(`${args.id}|${row.rowIndex}|${row.phone}|${row.total}`),
        createdAt: Date.now(),
      });
      allocationsCreated += 1;
      allocated = roundMoney(allocated + row.total);
    }
    const baseForUnallocated =
      chargeMode === "attached"
        ? (candidates.find((c) => `${c._id}` === chargeId)?.total ??
          candidates.find((c) => `${c._id}` === chargeId)?.amount ??
          groupTotal)
        : groupTotal;
    const unallocated = chargeId ? roundMoney(baseForUnallocated - allocated) : 0;
    unallocatedTotal = roundMoney(unallocatedTotal + Math.max(0, unallocated));
    groupReports.push({
      contractNumber,
      month,
      periodKey,
      chargeMode,
      chargeId,
      allocatedTotal: allocated,
      unallocated,
      allocations: effectiveRows.length,
    });
  }

  const expensesCreated = chargesCreated + allocationsCreated;

  await ctx.db.patch(args.id, {
    status: "applied",
    appliedAt: Date.now(),
    appliedSummary: {
      expensesCreated,
      simCardsCreated,
      tariffsCreated,
      contractsCreated,
      chargesCreated,
      allocationsCreated,
      chargesAttached,
      unallocatedTotal,
      ambiguities: ambiguities.length,
    },
    reconciliation: {
      groups: groupReports.length,
      chargesCreated,
      chargesAttached,
      allocationsCreated,
      unallocatedTotal,
      ambiguousGroups: groupReports.filter((g) => g.chargeMode.startsWith("ambiguous")).length,
    },
  });
  await writeAudit(ctx, {
    entityType: "billingImport",
    entityId: `${args.id}`,
    action: "applied",
    details: { expensesCreated, allocationsCreated, chargesCreated, ambiguities: ambiguities.length },
  });
  return {
    ok: true,
    status: "applied",
    reconciliation: { groups: groupReports, ambiguities, unallocatedTotal },
  };
}

export const requestUpload = mutation({
  args: {},
  handler: async (ctx: MutationCtx): Promise<{ uploadUrl: string }> => {
    await requireAuthIfEnabled(ctx);
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

export const saveUpload = mutation({
  args: {
    fileId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: { fileId: Id<"_storage">; fileName: string },
  ): Promise<{ importId: string }> => {
    await requireAuthIfEnabled(ctx);
    const importId = await ctx.db.insert("billingImports", {
      fileId: args.fileId,
      fileName: args.fileName,
      status: "uploaded",
      createdAt: Date.now(),
    });
    return { importId: `${importId}` };
  },
});

/** Server-only: record the SHA-256 calculated from storage bytes by the action. */
export async function setContentHashCore(
  ctx: MutationCtx,
  args: { id: Id<"billingImports">; sha256: string; sourceKind?: string },
): Promise<{ ok: boolean }> {
  const record = await ctx.db.get(args.id);
  if (!record) throw new Error("Импорт не найден");
  if (record.status === "applied" && !record.voided) {
    throw new Error("Применённый импорт уже зафиксирован");
  }
  await ctx.db.patch(args.id, {
    fileHash: args.sha256,
    fingerprint: `sha256:${args.sha256}`,
    sourceKind: args.sourceKind,
  });
  return { ok: true };
}

export const setContentHash = internalMutation({
  args: { id: v.id("billingImports"), sha256: v.string(), sourceKind: v.optional(v.string()) },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"billingImports">; sha256: string; sourceKind?: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    return await setContentHashCore(ctx, args);
  },
});

export const get = query({
  args: { id: v.id("billingImports") },
  handler: async (
    ctx: QueryCtx,
    { id }: { id: Id<"billingImports"> },
  ): Promise<Doc<"billingImports"> | null> => {
    await requireAuthIfEnabled(ctx);
    return await ctx.db.get(id);
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx: QueryCtx,
    { limit }: { limit?: number },
  ): Promise<Doc<"billingImports">[]> => {
    await requireAuthIfEnabled(ctx);
    const items = await ctx.db.query("billingImports").collect();
    const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.slice(0, limit ?? 20);
  },
});

export type ImportReconciliation = {
  importId: string;
  status: string;
  charges: number;
  allocations: number;
  chargeTotal: number;
  allocatedTotal: number;
  unallocated: number;
  unassignedToEmployee: number;
};

export const getReconciliation = query({
  args: { id: v.id("billingImports") },
  handler: async (
    ctx: QueryCtx,
    { id }: { id: Id<"billingImports"> },
  ): Promise<ImportReconciliation> => {
    await requireAuthIfEnabled(ctx);
    const record = await ctx.db.get(id);
    if (!record) throw new Error("Импорт не найден");
    const expenses = await ctx.db.query("expenses").collect();
    const linked = expenses.filter((e) => e.importId && `${e.importId}` === `${id}` && !e.voided);
    const charges = linked.filter((e) => expenseKindOf(e) === "charge");
    const allocations = linked.filter((e) => expenseKindOf(e) === "allocation");
    const chargeTotal = roundMoney(
      charges.reduce((acc, e) => acc + (e.total ?? e.amount + (e.vat ?? 0)), 0),
    );
    const allocatedTotal = roundMoney(
      allocations.reduce((acc, e) => acc + (e.total ?? e.amount + (e.vat ?? 0)), 0),
    );
    return {
      importId: `${id}`,
      status: record.status,
      charges: charges.length,
      allocations: allocations.length,
      chargeTotal,
      allocatedTotal,
      unallocated: roundMoney(chargeTotal - allocatedTotal),
      unassignedToEmployee: allocations.filter((e) => !e.employeeId).length,
    };
  },
});

export const remove = mutation({
  args: { id: v.id("billingImports") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"billingImports"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const record = await ctx.db.get(id);
    if (!record) return { ok: false };
    if (record.status === "applied" && !record.voided) {
      throw new Error("Применённый импорт нельзя удалить: используйте voidImport для аннулирования");
    }
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_import", (q) => q.eq("importId", id))
      .collect();
    for (const expense of expenses) {
      await ctx.db.delete(expense._id);
    }
    await ctx.storage.delete(record.fileId);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const voidImport = mutation({
  args: { id: v.id("billingImports"), reason: v.string() },
  handler: async (
    ctx: MutationCtx,
    { id, reason }: { id: Id<"billingImports">; reason: string },
  ): Promise<{ ok: boolean; expensesVoided: number }> => {
    await requireAuthIfEnabled(ctx);
    if (!reason.trim()) throw new Error("Причина аннулирования обязательна");
    const record = await ctx.db.get(id);
    if (!record) throw new Error("Импорт не найден");
    if (record.voided) return { ok: true, expensesVoided: 0 };
    const now = Date.now();
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_import", (q) => q.eq("importId", id))
      .collect();
    for (const expense of expenses) {
      if (!expense.voided) {
        await ctx.db.patch(expense._id, {
          voided: true,
          voidReason: reason,
          voidedAt: now,
          status: "cancelled",
        });
      }
    }
    await ctx.db.patch(id, { voided: true, voidReason: reason, voidedAt: now, status: "voided" });
    await writeAudit(ctx, {
      entityType: "billingImport",
      entityId: `${id}`,
      action: "voided",
      reason,
      details: { expensesVoided: expenses.length },
    });
    return { ok: true, expensesVoided: expenses.length };
  },
});

export type ImportContextResult = {
  contracts: Doc<"contracts">[];
  operators: Doc<"operators">[];
  simCards: Doc<"simCards">[];
  tariffs: Doc<"tariffs">[];
};

export const getContext = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<ImportContextResult> => {
    await requireAuthIfEnabled(ctx);
    const [contracts, operators, simCards, tariffs] = await Promise.all([
      ctx.db.query("contracts").collect(),
      ctx.db.query("operators").collect(),
      ctx.db.query("simCards").collect(),
      ctx.db.query("tariffs").collect(),
    ]);
    return { contracts, operators, simCards, tariffs };
  },
});

export type PreviewSummaryInput = {
  rows: number;
  contractsMissing: number;
  simCardsMissing: number;
  tariffsMissing: number;
  vatMismatches: number;
  totalAmount: number;
  totalVat: number;
  totalTotal: number;
};

export const updatePreviewSummary = mutation({
  args: {
    id: v.id("billingImports"),
    summary: v.object({
      rows: v.number(),
      contractsMissing: v.number(),
      simCardsMissing: v.number(),
      tariffsMissing: v.number(),
      vatMismatches: v.number(),
      totalAmount: v.number(),
      totalVat: v.number(),
      totalTotal: v.number(),
    }),
  },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"billingImports">; summary: PreviewSummaryInput },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Импорт не найден");
    if (record.status === "applied" && !record.voided) {
      throw new Error("Применённый импорт не возвращается в preview");
    }
    await ctx.db.patch(args.id, { status: "preview", previewSummary: args.summary });
    return { ok: true };
  },
});

const importRowValidator = v.object({
  rowIndex: v.number(),
  phone: v.string(),
  contractNumber: v.string(),
  tariffName: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  month: v.string(),
  amount: v.number(),
  vat: v.number(),
  total: v.number(),
  vatMismatch: v.boolean(),
  tariffFee: v.number(),
  isVatOnly: v.boolean(),
});

const resolutionValidator = v.object({
  contractNumber: v.string(),
  company: v.union(
    v.object({ mode: v.literal("existing"), id: v.id("companies") }),
    v.object({
      mode: v.literal("create"),
      name: v.string(),
      inn: v.optional(v.string()),
      kpp: v.optional(v.string()),
      comment: v.optional(v.string()),
      forceCreate: v.optional(v.boolean()),
    }),
  ),
  operator: v.union(
    v.object({ mode: v.literal("existing"), id: v.id("operators") }),
    v.object({
      mode: v.literal("create"),
      name: v.string(),
      type: v.optional(v.string()),
      manager: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  ),
  name: v.optional(v.string()),
  type: v.string(),
  status: v.union(v.literal("active"), v.literal("closing")),
  startDate: v.string(),
  endDate: v.string(),
  monthlyFee: v.number(),
  simCount: v.number(),
});

export const applyParsed = mutation({
  args: {
    id: v.id("billingImports"),
    rows: v.array(importRowValidator),
    contractResolutions: v.array(resolutionValidator),
    simCardActions: v.optional(
      v.array(v.object({ phone: v.string(), action: v.union(v.literal("create"), v.literal("skip")) })),
    ),
    tariffOverrides: v.optional(
      v.array(
        v.object({
          operatorId: v.id("operators"),
          tariffName: v.string(),
          monthlyFee: v.optional(v.number()),
        }),
      ),
    ),
    vatDistributionKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx: MutationCtx, args: ApplyParsedInput): Promise<ApplyParsedResult> => {
    await requireAuthIfEnabled(ctx);
    return await applyParsedCore(ctx, args);
  },
});
