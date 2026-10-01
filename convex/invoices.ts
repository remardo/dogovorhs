import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import {
  buildDocumentKey,
  checkMoneyTriple,
  companyKeyFor,
  decideChargeReuse,
  isMultiMonthRange,
  normalizeContractNumber,
  roundMoney,
  toIsoDate,
  toPeriodKey,
  validatePeriodRange,
  type ChargeCandidate,
} from "./_lib/accounting";
import { writeAudit } from "./_lib/audit";

export type InvoiceListItem = {
  id: string;
  fileName: string;
  fileUrl: string | null;
  operator: string;
  kind: "invoice" | "detail";
  invoiceNo: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  month: string;
  periodKey: string;
  multiMonth: boolean;
  contractNumber: string;
  contractId?: string;
  contract: string;
  companyId?: string;
  company: string;
  amount: number;
  vat: number;
  total: number;
  serviceTotal?: number;
  amountDue?: number;
  openingBalance?: number;
  payments?: number;
  status: "draft" | "matched" | "void";
  expenseId?: string;
  chargeId?: string;
  chargeTotal: number;
  allocatedTotal: number;
  unallocated: number;
  allocationsCount: number;
  identityKey?: string;
  documentKey?: string;
  contentSha256?: string;
  fingerprint?: string;
  fileHash?: string;
  voided: boolean;
  voidReason: string;
  appliedAt?: number;
  note: string;
  createdAt: number;
};

export type InvoiceListResult = {
  items: InvoiceListItem[];
  companies: { id: string; name: string }[];
  contracts: { id: string; name: string }[];
  summary: { total: number; matched: number; draft: number; voided: number };
  activeCount: number;
};

export type InvoiceReconciliation = {
  invoiceId: string;
  kind: "invoice" | "detail";
  voided: boolean;
  chargeId?: string;
  chargeTotal: number;
  allocations: {
    id: string;
    total: number;
    simNumber: string;
    employeeId?: string;
    contractId?: string;
  }[];
  allocatedTotal: number;
  unallocated: number;
  matched: boolean;
};

export type ApplyInvoiceResult =
  | { status: "applied"; invoiceId: string; chargeId?: string; chargeMode: "created" | "reused" | "none" }
  | { status: "needs_review"; invoiceId: string; reason: string; candidates: number };

export type InvoiceArgs = {
  fileId: Id<"_storage">;
  fileName: string;
  operator: string;
  kind: "invoice" | "detail";
  invoiceNo: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  month: string;
  contractNumber: string;
  contractId?: Id<"contracts">;
  companyId?: Id<"companies">;
  operatorId?: Id<"operators">;
  amount: number;
  vat: number;
  total: number;
  note?: string;
  vatRate?: number;
  serviceTotal?: number;
  vatBasis?: string;
  serviceType?: string;
};

function periodKeyFor(month: string, periodEnd: string, periodStart: string): string {
  return (
    toPeriodKey(periodEnd) || toPeriodKey(periodStart) || toPeriodKey(month) || ""
  );
}

function semanticIdentity(args: {
  operator: string;
  companyId?: Id<"companies">;
  companyName?: string;
  invoiceNo: string;
  invoiceDate: string;
  kind: string;
}): string {
  return buildDocumentKey({
    operator: args.operator,
    companyKey: companyKeyFor(
      args.companyId ? `${args.companyId}` : undefined,
      args.companyName,
    ),
    invoiceNo: args.invoiceNo,
    invoiceDate: args.invoiceDate,
    kind: args.kind,
  });
}

async function resolveContractCompany(
  ctx: MutationCtx,
  contractId: Id<"contracts"> | undefined,
  companyId: Id<"companies"> | undefined,
): Promise<{ contract: Doc<"contracts"> | null; companyId: Id<"companies"> | undefined; contractNumber: string | undefined }> {
  if (!contractId) return { contract: null, companyId, contractNumber: undefined };
  const contract = await ctx.db.get(contractId);
  if (!contract) throw new Error("Договор не найден");
  if (companyId && `${companyId}` !== `${contract.companyId}`) {
    throw new Error("Компания не соответствует договору");
  }
  return { contract, companyId: companyId ?? contract.companyId, contractNumber: contract.number };
}

export async function findDuplicateInvoice(
  ctx: MutationCtx,
  candidate: { fileId: Id<"_storage">; identityKey: string; contentSha256?: string },
): Promise<Doc<"invoices"> | null> {
  const all = await ctx.db.query("invoices").collect();
  for (const inv of all) {
    if (`${inv.fileId}` === `${candidate.fileId}`) return inv;
    if (inv.identityKey && inv.identityKey === candidate.identityKey) return inv;
    if (candidate.contentSha256 && inv.contentSha256 && inv.contentSha256 === candidate.contentSha256) {
      return inv;
    }
  }
  return null;
}

export async function findReuseCandidates(
  ctx: MutationCtx,
  scope: { companyId: Id<"companies">; contractId?: Id<"contracts">; periodKey: string },
): Promise<ChargeCandidate[]> {
  const all = await ctx.db.query("expenses").collect();
  const out: ChargeCandidate[] = [];
  for (const e of all) {
    if (e.kind === "allocation") continue;
    if (e.voided || e.status === "cancelled") continue;
    if (`${e.companyId}` !== `${scope.companyId}`) continue;
    if (scope.contractId) {
      if (!e.contractId || `${e.contractId}` !== `${scope.contractId}`) continue;
    }
    const key = e.periodKey ?? toPeriodKey(e.month);
    if (key !== scope.periodKey) continue;
    out.push({
      id: `${e._id}`,
      companyId: `${e.companyId}`,
      contractId: e.contractId ? `${e.contractId}` : undefined,
      periodKey: key,
      amount: e.amount,
      vat: e.vat ?? 0,
      total: e.total ?? e.amount + (e.vat ?? 0),
      invoiceId: e.invoiceId ? `${e.invoiceId}` : undefined,
    });
  }
  return out;
}

export async function createInvoiceCore(
  ctx: MutationCtx,
  args: InvoiceArgs,
  opts: { contentSha256?: string; withCharge: boolean },
): Promise<ApplyInvoiceResult> {
  const invoiceNo = args.invoiceNo.trim();
  const contractNumberRaw = args.contractNumber.trim();
  if (!invoiceNo) throw new Error("Номер счёта обязателен");
  if (!contractNumberRaw) throw new Error("Номер договора обязателен");
  if (!args.operator.trim()) throw new Error("Оператор обязателен");
  if (!args.month.trim()) throw new Error("Период (month) обязателен");
  const invoiceDateIso = toIsoDate(args.invoiceDate);
  if (!invoiceDateIso) throw new Error(`Некорректная дата счёта: ${args.invoiceDate || "пусто"}`);
  checkMoneyTriple(args.amount, args.vat, args.total);
  if (args.periodStart && args.periodEnd) {
    validatePeriodRange(args.periodStart, args.periodEnd);
  }

  const resolved = await resolveContractCompany(ctx, args.contractId, args.companyId);
  const contractNumber = resolved.contractNumber ?? contractNumberRaw;
  if (args.contractId && resolved.contract) {
    const want = normalizeContractNumber(contractNumberRaw);
    if (want && want !== normalizeContractNumber(resolved.contract.number)) {
      throw new Error("Номер договора не соответствует выбранному договору");
    }
  }
  const periodKey = periodKeyFor(args.month, args.periodEnd, args.periodStart);
  const multiMonth =
    args.periodStart && args.periodEnd ? isMultiMonthRange(args.periodStart, args.periodEnd) : false;
  const identityKey = semanticIdentity({
    operator: args.operator,
    companyId: resolved.companyId,
    invoiceNo,
    invoiceDate: args.invoiceDate,
    kind: args.kind,
  });
  const duplicate = await findDuplicateInvoice(ctx, {
    fileId: args.fileId,
    identityKey,
    contentSha256: opts.contentSha256,
  });
  if (duplicate) {
    throw new Error("Дубликат документа: такой счёт уже зарегистрирован (требуется явная сверка)");
  }

  if(resolved.contract){
    const operator=await ctx.db.get(resolved.contract.operatorId);
    if(args.operatorId && args.operatorId!==resolved.contract.operatorId)throw new Error("Оператор не соответствует договору");
    if(operator && operator.name.trim().toLowerCase()!==args.operator.trim().toLowerCase())throw new Error("Название оператора не соответствует выбранному договору");
  }
  const now = Date.now();
  const invoiceId = await ctx.db.insert("invoices", {
    fileId: args.fileId,
    fileName: args.fileName,
    operator: args.operator,
    kind: args.kind,
    invoiceNo,
    invoiceDate: invoiceDateIso,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    month: args.month,
    contractNumber,
    contractId: args.contractId,
    companyId: resolved.companyId,
    operatorId: args.operatorId,
    amount: args.amount,
    vat: args.vat,
    total: args.total,
    status: args.contractId ? "matched" : "draft",
    note: args.note,
    createdAt: now,
    appliedAt: opts.withCharge ? now : undefined,
    identityKey,
    documentKey: identityKey,
    contentSha256: opts.contentSha256,
    fingerprint: undefined,
    fileHash: opts.contentSha256,
    periodKey: periodKey || undefined,
    multiMonth,
    vatRate: args.vatRate,
    serviceTotal: args.serviceTotal,
    amountDue: args.total,
    vatBasis: args.vatBasis,
  });

  const serviceTotal = args.serviceTotal ?? args.total;
  if (!Number.isFinite(serviceTotal) || serviceTotal < 0) throw new Error("Некорректная сумма услуг");
  if (serviceTotal !== args.total && args.vatRate === undefined) throw new Error("Для отдельной суммы услуг укажите ставку НДС документа");
  const serviceAmount = serviceTotal === args.total ? args.amount : roundMoney(serviceTotal / (1 + (args.vatRate ?? 0) / 100));
  const serviceVat = roundMoney(serviceTotal - serviceAmount);
  let chargeMode: "created" | "reused" | "none" = "none";
  let chargeId: string | undefined;
  if (opts.withCharge && args.kind === "invoice" && args.contractId && resolved.companyId && periodKey) {
    const candidates = await findReuseCandidates(ctx, {
      companyId: resolved.companyId,
      contractId: args.contractId,
      periodKey,
    });
    const decision = decideChargeReuse(
      candidates,
      {
        companyId: `${resolved.companyId}`,
        contractId: `${args.contractId}`,
        periodKey,
      },
      { amount: serviceAmount, vat: serviceVat, total: serviceTotal },
    );
    if (decision.mode === "reuse") {
      await ctx.db.patch(decision.chargeId as Id<"expenses">, {
        invoiceId,
        documentKey: identityKey,
      });
      await ctx.db.patch(invoiceId, { expenseId: decision.chargeId as Id<"expenses">, status: "matched" });
      chargeId = decision.chargeId;
      chargeMode = "reused";
    } else if (decision.mode === "create") {
      const contract = resolved.contract;
      const serviceCategory =
        args.serviceType ?? contract?.serviceCategory ?? contract?.type ?? "Мобильная связь";
      const expenseId = await ctx.db.insert("expenses", {
        companyId: resolved.companyId,
        contract: contractNumber,
        contractId: args.contractId,
        operator: args.operator,
        month: args.month,
        periodKey,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        multiMonth,
        type: serviceCategory,
        serviceCategory,
        amount: serviceAmount,
        vat: serviceVat,
        total: serviceTotal,
        vatBasis: serviceTotal === args.total ? args.vatBasis : "computedFromInvoiceRate",
        basis: serviceTotal === args.total ? "Счёт оператора" : "Стоимость услуг за период; сумма к оплате включает остаток",
        status: "confirmed",
        hasDocument: true,
        kind: "charge",
        invoiceId,
        documentKey: identityKey,
        createdAt: now,
      });
      await ctx.db.patch(invoiceId, { expenseId, status: "matched" });
      chargeId = `${expenseId}`;
      chargeMode = "created";
    } else {
      await ctx.db.patch(invoiceId, {
        status: "draft",
        note: `требуется сверка: ${decision.reason} (${decision.count})`,
      });
      await writeAudit(ctx, {
        entityType: "invoice",
        entityId: `${invoiceId}`,
        action: "needs_review",
        details: { identityKey, reason: decision.reason, candidates: decision.count },
      });
      return { status: "needs_review", invoiceId: `${invoiceId}`, reason: decision.reason, candidates: decision.count };
    }
  }

  await writeAudit(ctx, {
    entityType: "invoice",
    entityId: `${invoiceId}`,
    action: chargeMode === "none" ? "applied" : "applied_with_charge",
    details: { identityKey, chargeId, chargeMode },
  });
  return { status: "applied", invoiceId: `${invoiceId}`, chargeId, chargeMode };
}

export async function rebindCore(
  ctx: MutationCtx,
  args: {
    id: Id<"invoices">;
    contractId?: Id<"contracts">;
    companyId?: Id<"companies">;
    contractNumber?: string;
    force?: boolean;
    note?: string;
  },
): Promise<{ ok: boolean }> {
  const invoice = await ctx.db.get(args.id);
  if (!invoice) throw new Error("Счёт не найден");
  if (invoice.voided) throw new Error("Аннулированный документ нельзя перепривязать");
  const resolved = await resolveContractCompany(ctx, args.contractId, args.companyId);
  const nextContractId = args.contractId ?? invoice.contractId;
  const nextCompanyId = resolved.companyId ?? invoice.companyId;
  if (!nextContractId || !nextCompanyId) {
    throw new Error("Для перепривязки нужны договор и компания");
  }
  const contract = await ctx.db.get(nextContractId);
  if (!contract) throw new Error("Договор не найден");
  if (`${contract.companyId}` !== `${nextCompanyId}`) {
    throw new Error("Компания не соответствует договору");
  }
  const nextContractNumber = resolved.contractNumber ?? args.contractNumber ?? invoice.contractNumber;

  const allExpenses = await ctx.db.query("expenses").collect();
  const charge = invoice.expenseId
    ? allExpenses.find((e) => `${e._id}` === `${invoice.expenseId}`)
    : allExpenses.find(
        (e) =>
          e.invoiceId &&
          `${e.invoiceId}` === `${invoice._id}` &&
          e.kind !== "allocation" &&
          !e.voided,
      );
  const allocations = allExpenses.filter(
    (e) =>
      e.kind === "allocation" &&
      !e.voided &&
      ((charge && e.parentExpenseId && `${e.parentExpenseId}` === `${charge._id}`) ||
        (e.invoiceId && `${e.invoiceId}` === `${invoice._id}`)),
  );
  if (allocations.length > 0 && !args.force) {
    throw new Error(
      `Документ имеет ${allocations.length} строк распределения: перепривязка требует явного подтверждения (force)`,
    );
  }
  // Never silently move a SIM bound to another contract.
  if (allocations.length > 0) {
    const simIds = [...new Set(allocations.flatMap((a) => (a.simCardId ? [`${a.simCardId}`] : [])))];
    for (const simId of simIds) {
      const sim = await ctx.db.get(simId as Id<"simCards">);
      if (sim?.contractId && `${sim.contractId}` !== `${nextContractId}`) {
        if (!args.force) {
          throw new Error(`Строка ссылается на SIM ${sim.number} другого договора: требуется явное решение`);
        }
      }
    }
  }
  await ctx.db.patch(args.id, {
    contractId: nextContractId,
    companyId: nextCompanyId,
    contractNumber: nextContractNumber,
    status: "matched",
    ...(args.note !== undefined ? { note: args.note } : {}),
  });
  if (charge && !charge.voided) {
    await ctx.db.patch(charge._id, {
      contractId: nextContractId,
      companyId: nextCompanyId,
      contract: nextContractNumber,
    });
  }
  for (const alloc of allocations) {
    await ctx.db.patch(alloc._id, {
      contractId: nextContractId,
      companyId: nextCompanyId,
      contract: nextContractNumber,
    });
  }
  await writeAudit(ctx, {
    entityType: "invoice",
    entityId: `${args.id}`,
    action: "rebound",
    details: {
      from: { contractId: invoice.contractId ? `${invoice.contractId}` : undefined },
      to: { contractId: `${nextContractId}` },
      allocations: allocations.length,
      sourceKept: true,
    },
  });
  return { ok: true };
}

export async function voidCore(ctx: MutationCtx, args: { id: Id<"invoices">; reason: string }): Promise<{ ok: boolean }> {
  if (!args.reason.trim()) throw new Error("Причина аннулирования обязательна");
  const invoice = await ctx.db.get(args.id);
  if (!invoice) throw new Error("Счёт не найден");
  if (invoice.voided) return { ok: true };
  const now = Date.now();
  await ctx.db.patch(args.id, {
    voided: true,
    voidReason: args.reason,
    voidedAt: now,
    status: "void",
  });
  const allExpenses = await ctx.db.query("expenses").collect();
  const linked = allExpenses.filter(
    (e) =>
      !e.voided &&
      ((invoice.expenseId && `${e._id}` === `${invoice.expenseId}`) ||
        (e.invoiceId && `${e.invoiceId}` === `${invoice._id}`) ||
        (invoice.expenseId &&
          e.parentExpenseId &&
          `${e.parentExpenseId}` === `${invoice.expenseId}`)),
  );
  for (const expense of linked) {
    await ctx.db.patch(expense._id, {
      voided: true,
      voidReason: args.reason,
      voidedAt: now,
      status: "cancelled",
    });
  }
  await writeAudit(ctx, {
    entityType: "invoice",
    entityId: `${args.id}`,
    action: "voided",
    reason: args.reason,
    details: { expensesVoided: linked.length },
  });
  return { ok: true };
}

function toListItem(
  inv: Doc<"invoices">,
  contract: Doc<"contracts"> | undefined,
  company: Doc<"companies"> | undefined,
  fileUrl: string | null,
  expenses: Doc<"expenses">[],
): InvoiceListItem {
  const charge = inv.expenseId
    ? expenses.find((e) => `${e._id}` === `${inv.expenseId}`)
    : undefined;
  const allocations = expenses.filter(
    (e) =>
      e.kind === "allocation" &&
      !e.voided &&
      ((charge && e.parentExpenseId && `${e.parentExpenseId}` === `${charge._id}`) ||
        (e.invoiceId && `${e.invoiceId}` === `${inv._id}`)),
  );
  const chargeTotal =
    charge && !charge.voided ? (charge.total ?? charge.amount + (charge.vat ?? 0)) : 0;
  const allocatedTotal = roundMoney(
    allocations.reduce((acc, e) => acc + (e.total ?? e.amount + (e.vat ?? 0)), 0),
  );
  return {
    id: `${inv._id}`,
    fileName: inv.fileName,
    fileUrl,
    operator: inv.operator,
    kind: inv.kind,
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.invoiceDate,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    month: inv.month,
    periodKey: inv.periodKey ?? toPeriodKey(inv.periodEnd) ?? toPeriodKey(inv.month),
    multiMonth: inv.multiMonth ?? false,
    contractNumber: inv.contractNumber,
    contractId: inv.contractId ? `${inv.contractId}` : undefined,
    contract: contract?.number ?? "",
    companyId: inv.companyId ? `${inv.companyId}` : undefined,
    company: company?.name ?? "",
    amount: inv.amount,
    vat: inv.vat,
    total: inv.total,
    serviceTotal:inv.serviceTotal,amountDue:inv.amountDue,openingBalance:inv.openingBalance,payments:inv.payments,
    status: inv.status,
    expenseId: inv.expenseId ? `${inv.expenseId}` : undefined,
    chargeId: inv.expenseId ? `${inv.expenseId}` : undefined,
    chargeTotal,
    allocatedTotal,
    unallocated: roundMoney(chargeTotal - allocatedTotal),
    allocationsCount: allocations.length,
    identityKey: inv.identityKey,
    documentKey: inv.documentKey,
    contentSha256: inv.contentSha256,
    fingerprint: inv.fingerprint,
    fileHash: inv.fileHash,
    voided: inv.voided ?? false,
    voidReason: inv.voidReason ?? "",
    appliedAt: inv.appliedAt,
    note: inv.note ?? "",
    createdAt: inv.createdAt,
  };
}

export async function listCore(ctx: QueryCtx): Promise<InvoiceListResult> {
  const { db } = ctx;
  const [invoices, contracts, companies, expenses] = await Promise.all([
    db.query("invoices").collect(),
    db.query("contracts").collect(),
    db.query("companies").collect(),
    db.query("expenses").collect(),
  ]);
  const contractById = new Map(contracts.map((c) => [`${c._id}`, c]));
  const companyById = new Map(companies.map((c) => [`${c._id}`, c]));

  const items: InvoiceListItem[] = [];
  const sorted = [...invoices].sort((a, b) => b.createdAt - a.createdAt);
  for (const inv of sorted) {
    const contract = inv.contractId ? contractById.get(`${inv.contractId}`) : undefined;
    const company = inv.companyId ? companyById.get(`${inv.companyId}`) : undefined;
    const fileUrl = await ctx.storage.getUrl(inv.fileId);
    items.push(toListItem(inv, contract, company, fileUrl, expenses));
  }

  const summary = items.reduce(
    (acc, item) => {
      if (item.voided) return acc;
      if (item.kind !== "invoice") return acc;
      acc.total = roundMoney(acc.total + item.total);
      if (item.status === "matched") acc.matched += 1;
      else if (item.status === "void") acc.voided += 1;
      else acc.draft += 1;
      return acc;
    },
    { total: 0, matched: 0, draft: 0, voided: 0 },
  );

  return {
    items,
    companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
    contracts: contracts.map((c) => ({ id: `${c._id}`, name: c.number })),
    summary,
    activeCount: invoices.filter((i) => !i.voided).length,
  };
}

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<InvoiceListResult> => {
    await requireAuthIfEnabled(ctx);
    return await listCore(ctx);
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx: QueryCtx, { id }: { id: Id<"invoices"> }): Promise<Doc<"invoices"> | null> => {
    await requireAuthIfEnabled(ctx);
    return await ctx.db.get(id);
  },
});

export const getReconciliation = query({
  args: { id: v.id("invoices") },
  handler: async (ctx: QueryCtx, { id }: { id: Id<"invoices"> }): Promise<InvoiceReconciliation> => {
    await requireAuthIfEnabled(ctx);
    const invoice = await ctx.db.get(id);
    if (!invoice) throw new Error("Счёт не найден");
    const expenses = await ctx.db.query("expenses").collect();
    const charge = invoice.expenseId
      ? expenses.find((e) => `${e._id}` === `${invoice.expenseId}`)
      : undefined;
    const allocations = expenses.filter(
      (e) =>
        e.kind === "allocation" &&
        !e.voided &&
        ((charge && e.parentExpenseId && `${e.parentExpenseId}` === `${charge._id}`) ||
          (e.invoiceId && `${e.invoiceId}` === `${invoice._id}`)),
    );
    const chargeTotal =
      charge && !charge.voided ? (charge.total ?? charge.amount + (charge.vat ?? 0)) : 0;
    const allocatedTotal = roundMoney(
      allocations.reduce((acc, e) => acc + (e.total ?? e.amount + (e.vat ?? 0)), 0),
    );
    return {
      invoiceId: `${invoice._id}`,
      kind: invoice.kind,
      voided: invoice.voided ?? false,
      chargeId: charge ? `${charge._id}` : undefined,
      chargeTotal,
      allocations: allocations.map((a) => ({
        id: `${a._id}`,
        total: a.total ?? a.amount + (a.vat ?? 0),
        simNumber: a.simNumber ?? "",
        employeeId: a.employeeId ? `${a.employeeId}` : undefined,
        contractId: a.contractId ? `${a.contractId}` : undefined,
      })),
      allocatedTotal,
      unallocated: roundMoney(chargeTotal - allocatedTotal),
      matched: chargeTotal === 0 || Math.abs(roundMoney(chargeTotal - allocatedTotal)) <= 0.02,
    };
  },
});

const invoiceInputValidator = {
  fileId: v.id("_storage"),
  fileName: v.string(),
  operator: v.string(),
  kind: v.union(v.literal("invoice"), v.literal("detail")),
  invoiceNo: v.string(),
  invoiceDate: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  month: v.string(),
  contractNumber: v.string(),
  contractId: v.optional(v.id("contracts")),
  companyId: v.optional(v.id("companies")),
  operatorId: v.optional(v.id("operators")),
  amount: v.number(),
  vat: v.number(),
  total: v.number(),
  note: v.optional(v.string()),
  vatRate: v.optional(v.number()),
  serviceTotal: v.optional(v.number()),
  vatBasis: v.optional(v.string()),
};

export const create = mutation({
  args: { ...invoiceInputValidator, createdAt: v.number() },
  handler: async (ctx: MutationCtx, args: InvoiceArgs & { createdAt: number }): Promise<Id<"invoices">> => {
    await requireAuthIfEnabled(ctx);
    const result = await createInvoiceCore(ctx, args, { withCharge: false });
    return result.invoiceId as Id<"invoices">;
  },
});

/** Public apply: atomic invoice + charge, semantic duplicate guard. */
export const apply = mutation({
  args: { ...invoiceInputValidator, serviceType: v.optional(v.string()) },
  handler: async (
    ctx: MutationCtx,
    args: InvoiceArgs & { serviceType?: string },
  ): Promise<ApplyInvoiceResult> => {
    await requireAuthIfEnabled(ctx);

    return await createInvoiceCore(ctx, args, { withCharge: true });
  },
});

/**
 * Server-only apply: same atomic path plus server-calculated content SHA-256.
 * Callable only from server actions (which read storage bytes), never clients.
 */
export const applyWithContent = internalMutation({
  args: { ...invoiceInputValidator, serviceType: v.optional(v.string()), contentSha256: v.string() },
  handler: async (
    ctx: MutationCtx,
    args: InvoiceArgs & { serviceType?: string; contentSha256: string },
  ): Promise<ApplyInvoiceResult> => {
    await requireAuthIfEnabled(ctx);

    return await createInvoiceCore(ctx, args, { withCharge: true, contentSha256: args.contentSha256 });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoices"),
    contractId: v.optional(v.id("contracts")),
    contractNumber: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    status: v.optional(v.union(v.literal("draft"), v.literal("matched"))),
    note: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      id: Id<"invoices">;
      contractId?: Id<"contracts">;
      contractNumber?: string;
      companyId?: Id<"companies">;
      status?: "draft" | "matched";
      note?: string;
      force?: boolean;
    },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    void args.status;
    return await rebindCore(ctx, {
      id: args.id,
      contractId: args.contractId,
      companyId: args.companyId,
      contractNumber: args.contractNumber,
      force: args.force ?? true,
      note: args.note,
    });
  },
});

export const rebind = mutation({
  args: {
    id: v.id("invoices"),
    contractId: v.optional(v.id("contracts")),
    companyId: v.optional(v.id("companies")),
    contractNumber: v.optional(v.string()),
    force: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: {
      id: Id<"invoices">;
      contractId?: Id<"contracts">;
      companyId?: Id<"companies">;
      contractNumber?: string;
      force?: boolean;
      note?: string;
    },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    return await rebindCore(ctx, args);
  },
});

export const voidInvoice = mutation({
  args: { id: v.id("invoices"), reason: v.string() },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"invoices">; reason: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    return await voidCore(ctx, args);
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"invoices"> },
  ): Promise<{ ok: boolean; voided?: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const invoice = await db.get(id);
    if (!invoice) return { ok: false };
    const expenses = await db.query("expenses").collect();
    const linked = expenses.some(
      (e) =>
        (invoice.expenseId && `${e._id}` === `${invoice.expenseId}`) ||
        (e.invoiceId && `${e.invoiceId}` === `${invoice._id}`),
    );
    if (linked || invoice.status === "matched" || invoice.expenseId) {
      // Retain history and the stored file: void instead of physical delete.
      await voidCore(ctx, { id, reason: "удаление через UI: аннулирован вместо уничтожения" });
      return { ok: true, voided: true };
    }
    await ctx.storage.delete(invoice.fileId);
    await db.delete(id);
    return { ok: true };
  },
});
