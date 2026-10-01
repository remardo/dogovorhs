import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import {
  buildDocumentKey,
  companyKeyFor,
  isMultiMonthRange,
  moneyMismatch,
  normalizeContractNumber,
  periodKeyFromDmy,
  periodKeyFromMonthLabel,
  roundMoney,
  toIsoDate,
  toPeriodKey,
} from "./_lib/accounting";
import { writeAudit } from "./_lib/audit";
import type { Doc } from "./_generated/dataModel";

export type MigrationAmbiguity = { area: string; key: string; detail: string };

function expenseTotal(e: { amount: number; vat?: number; total?: number }): number {
  return e.total ?? e.amount + (e.vat ?? 0);
}

export type MigrationPlan = {
  stats: Record<string, number>;
  ambiguities: MigrationAmbiguity[];
  contractPatches: { id: Id<"contracts">; patch: { normalizedNumber?: string; serviceCategory?: string } }[];
  simPatches: { id: Id<"simCards">; patch: { normalizedNumber?: string; contractId?: Id<"contracts"> } }[];
  expensePatches: {
    id: Id<"expenses">;
    patch: { kind?: "charge"; periodKey?: string; multiMonth?: boolean; serviceCategory?: string; contractId?: Id<"contracts">; documentKey?: string };
  }[];
  invoicePatches: {
    id: Id<"invoices">;
    patch: { periodKey?: string; multiMonth?: boolean; identityKey?: string; documentKey?: string; fingerprint?: string };
  }[];
  assignmentsToCreate: { simCardId: Id<"simCards">; employeeId?: Id<"employees">; contractId?: Id<"contracts">; assignedAt: number }[];
  invoiceLinks: { invoiceId: Id<"invoices">; expenseId: Id<"expenses"> }[];
  totalsBefore: number;
};

function computePlan(data: {
  contracts: Doc<"contracts">[];
  simCards: Doc<"simCards">[];
  expenses: Doc<"expenses">[];
  invoices: Doc<"invoices">[];
  imports: Doc<"billingImports">[];
  assignments: Doc<"simAssignments">[];
}): MigrationPlan {
  const { contracts, simCards, expenses, invoices, imports, assignments } = data;
  const ambiguities: MigrationAmbiguity[] = [];
  const plan: MigrationPlan = {
    stats: {},
    ambiguities,
    contractPatches: [],
    simPatches: [],
    expensePatches: [],
    invoicePatches: [],
    assignmentsToCreate: [],
    invoiceLinks: [],
    totalsBefore: 0,
  };

  plan.totalsBefore = roundMoney(
    expenses
      .filter((e) => !e.voided && e.kind !== "allocation" && e.status !== "cancelled")
      .reduce((acc, e) => acc + expenseTotal(e), 0),
  );

  // Contracts: normalize + service category; duplicates are ambiguous.
  const normCount = new Map<string, number>();
  for (const c of contracts) {
    const norm = c.normalizedNumber ?? normalizeContractNumber(c.number);
    normCount.set(norm, (normCount.get(norm) ?? 0) + 1);
  }
  for (const c of contracts) {
    const norm = normalizeContractNumber(c.number);
    if (!c.normalizedNumber || !c.serviceCategory) {
      plan.contractPatches.push({
        id: c._id,
        patch: {
          ...(!c.normalizedNumber ? { normalizedNumber: norm } : {}),
          ...(!c.serviceCategory ? { serviceCategory: c.type } : {}),
        },
      });
    }
    if ((normCount.get(norm) ?? 0) > 1) {
      ambiguities.push({
        area: "contracts",
        key: c.number,
        detail: "duplicate_normalized_number: требуется составной ключ оператор/компания",
      });
    }
  }

  const contractByNorm = new Map<string, Doc<"contracts">[]>();
  for (const c of contracts) {
    const norm = c.normalizedNumber ?? normalizeContractNumber(c.number);
    const list = contractByNorm.get(norm) ?? [];
    list.push(c);
    contractByNorm.set(norm, list);
  }

  // SIMs: normalize; link contract only when exactly one candidate.
  for (const sim of simCards) {
    const norm = (sim.number ?? "").replace(/\D/g, "");
    const patch: { normalizedNumber?: string; contractId?: Id<"contracts"> } = {};
    if (!sim.normalizedNumber && norm) patch.normalizedNumber = norm;
    if (!sim.contractId) {
      const candidates = contracts.filter(
        (c) => `${c.companyId}` === `${sim.companyId}` && `${c.operatorId}` === `${sim.operatorId}`,
      );
      if (candidates.length === 1) {
        patch.contractId = candidates[0]._id;
      } else if (candidates.length > 1) {
        ambiguities.push({
          area: "simCards",
          key: sim.number,
          detail: `ambiguous_contract:${candidates.length} договора компании/оператора — связь не устанавливается автоматически`,
        });
      }
    }
    if (patch.normalizedNumber || patch.contractId) {
      plan.simPatches.push({ id: sim._id, patch });
    }
    if (sim.employeeId) {
      const hasAssignment = assignments.some((a) => `${a.simCardId}` === `${sim._id}`);
      if (!hasAssignment) {
        plan.assignmentsToCreate.push({
          simCardId: sim._id,
          employeeId: sim.employeeId,
          contractId: sim.contractId,
          assignedAt: sim.createdAt,
        });
      }
    }
  }

  // Expenses: additive backfill, never change amounts or ids.
  for (const e of expenses) {
    const patch: MigrationPlan["expensePatches"][number]["patch"] = {};
    if (!e.kind) patch.kind = "charge";
    const periodKey =
      e.periodKey || toPeriodKey(e.periodStart || "") || toPeriodKey(e.periodEnd || "") || periodKeyFromMonthLabel(e.month || "") || "";
    if (!e.periodKey && periodKey) patch.periodKey = periodKey;
    if (!e.periodKey && !periodKey) {
      ambiguities.push({ area: "expenses", key: `${e._id}`, detail: "unknown_period" });
    }
    if (e.periodStart && e.periodEnd && e.multiMonth === undefined) {
      patch.multiMonth = isMultiMonthRange(e.periodStart, e.periodEnd);
    }
    if (!e.serviceCategory) {
      const contract = e.contractId
        ? contracts.find((c) => `${c._id}` === `${e.contractId}`)
        : undefined;
      patch.serviceCategory = contract?.serviceCategory ?? contract?.type ?? e.type;
    }
    if (!e.contractId && e.contract) {
      const candidates = contractByNorm.get(normalizeContractNumber(e.contract)) ?? [];
      const sameCompany = candidates.filter((c) => `${c.companyId}` === `${e.companyId}`);
      if (sameCompany.length === 1) {
        patch.contractId = sameCompany[0]._id;
      } else if (sameCompany.length > 1) {
        ambiguities.push({
          area: "expenses",
          key: `${e._id}`,
          detail: `ambiguous_contract:${e.contract} — несколько договоров с тем же номером`,
        });
      } else if (candidates.length > 0) {
        ambiguities.push({
          area: "expenses",
          key: `${e._id}`,
          detail: `contract_company_mismatch:${e.contract} — договор другой компании`,
        });
      } else {
        ambiguities.push({ area: "expenses", key: `${e._id}`, detail: `unknown_contract:${e.contract}` });
      }
    }
    if (e.amount !== undefined && e.vat !== undefined && e.total !== undefined) {
      const mismatch = moneyMismatch(e.amount, e.vat ?? 0, e.total ?? 0);
      if (mismatch !== 0) {
        ambiguities.push({
          area: "expenses",
          key: `${e._id}`,
          detail: `money_mismatch:${mismatch} — сверить с оригиналом документа`,
        });
      }
    }
    if (Object.keys(patch).length > 0) plan.expensePatches.push({ id: e._id, patch });
  }

  // Invoices: identity + period; link charge only on unambiguous reconciliation.
  const seenIdentity = new Map<string, string[]>();
  for (const inv of invoices) {
    const patch: MigrationPlan["invoicePatches"][number]["patch"] = {};
    const periodKey =
      inv.periodKey || toPeriodKey(inv.periodEnd || "") || toPeriodKey(inv.periodStart || "") || periodKeyFromMonthLabel(inv.month || "") || periodKeyFromDmy(inv.periodEnd || "");
    if (!inv.periodKey && periodKey) patch.periodKey = periodKey;
    if (inv.periodStart && inv.periodEnd && inv.multiMonth === undefined) {
      patch.multiMonth = isMultiMonthRange(inv.periodStart, inv.periodEnd);
    }
    let identity = inv.identityKey;
    if (!identity) {
      try {
        identity = buildDocumentKey({
          operator: inv.operator ?? "",
          companyKey: companyKeyFor(inv.companyId ? `${inv.companyId}` : undefined),
          invoiceNo: inv.invoiceNo ?? "",
          invoiceDate: toIsoDate(inv.invoiceDate ?? "") || inv.invoiceDate,
          kind: inv.kind ?? "invoice",
        });
        patch.identityKey = identity;
        patch.documentKey = identity;
      } catch {
        ambiguities.push({ area: "invoices", key: `${inv._id}`, detail: "unknown_identity: нет номера/даты" });
      }
    }
    if (!inv.fingerprint && identity) {
      patch.fingerprint = `legacy:${identity.length}`;
    }
    if (Object.keys(patch).length > 0) plan.invoicePatches.push({ id: inv._id, patch });
    if (identity) {
      const list = seenIdentity.get(identity) ?? [];
      list.push(`${inv._id}`);
      seenIdentity.set(identity, list);
    }

    if (!inv.expenseId && !inv.voided && inv.kind === "invoice" && inv.contractId && inv.companyId) {
      const key = inv.periodKey ?? periodKey;
      const candidates = expenses.filter(
        (e) =>
          !e.voided &&
          e.kind !== "allocation" &&
          ((e.contractId && `${e.contractId}` === `${inv.contractId}`) ||
            (!e.contractId && e.contract === inv.contractNumber)) &&
          (key ? ((e.periodKey ?? toPeriodKey(e.month)) === key || e.month === inv.month) : e.month === inv.month) &&
          Math.abs(roundMoney(expenseTotal(e)) - roundMoney(inv.total ?? 0)) <= 0.02,
      );
      if (candidates.length === 1) {
        plan.invoiceLinks.push({ invoiceId: inv._id, expenseId: candidates[0]._id });
      } else if (candidates.length > 1) {
        ambiguities.push({
          area: "invoices",
          key: `${inv._id}`,
          detail: `ambiguous_charge:${candidates.length} начислений совпадают — ручная сверка`,
        });
      } else {
        ambiguities.push({
          area: "invoices",
          key: `${inv._id}`,
          detail: "no_matching_charge: начисление не найдено или суммы расходятся",
        });
      }
    }
    if (inv.kind === "detail") {
      ambiguities.push({
        area: "invoices",
        key: `${inv._id}`,
        detail: "detail_document: распределение проверяется через сверку счёта/детализации",
      });
    }
  }
  for (const [key, ids] of seenIdentity) {
    if (ids.length > 1) {
      ambiguities.push({ area: "invoices", key, detail: `duplicate_document:${ids.length} документов с одним ключом` });
    }
  }

  // Same contract+period with several distinct invoices must stay distinct.
  const invoiceGroups = new Map<string, Doc<"invoices">[]>();
  for (const inv of invoices) {
    if (inv.kind !== "invoice" || inv.voided) continue;
    const key = `${inv.contractNumber}::${inv.periodKey ?? inv.month}::${inv.companyId ?? ""}`;
    const list = invoiceGroups.get(key) ?? [];
    list.push(inv);
    invoiceGroups.set(key, list);
  }
  for (const [key, group] of invoiceGroups) {
    const totals = new Set(group.map((g) => roundMoney(g.total ?? 0)));
    if (group.length > 1 && totals.size > 1) {
      ambiguities.push({
        area: "invoices",
        key,
        detail: `several_invoices_same_period:${group.length} разных счёта одного договора за месяц — не схлопывать`,
      });
    }
  }

  for (const imp of imports) {
    if (!imp.fileHash && imp.status === "applied") {
      ambiguities.push({
        area: "billingImports",
        key: `${imp._id}`,
        detail: "missing_file_hash: повтор файла определяется только после переимпорта с hash",
      });
    }
  }

  plan.stats = {
    contracts: contracts.length,
    simCards: simCards.length,
    expenses: expenses.length,
    invoices: invoices.length,
    imports: imports.length,
    contractPatches: plan.contractPatches.length,
    simPatches: plan.simPatches.length,
    expensePatches: plan.expensePatches.length,
    invoicePatches: plan.invoicePatches.length,
    assignmentsToCreate: plan.assignmentsToCreate.length,
    invoiceLinks: plan.invoiceLinks.length,
    ambiguities: ambiguities.length,
    totalsBefore: plan.totalsBefore,
  };

  return plan;
}

export type DryRunResult = {
  mode: "dry-run";
  stats: Record<string, number>;
  ambiguities: MigrationAmbiguity[];
  totalsPreserved: boolean;
  note: string;
};

export async function dryRunCore(ctx: QueryCtx): Promise<DryRunResult> {
  const [contracts, simCards, expenses, invoices, imports, assignments] = await Promise.all([
    ctx.db.query("contracts").collect(),
    ctx.db.query("simCards").collect(),
    ctx.db.query("expenses").collect(),
    ctx.db.query("invoices").collect(),
    ctx.db.query("billingImports").collect(),
    ctx.db.query("simAssignments").collect(),
  ]);
  const plan = computePlan({ contracts, simCards, expenses, invoices, imports, assignments });
  return {
    mode: "dry-run",
    stats: plan.stats,
    ambiguities: plan.ambiguities.slice(0, 500),
    totalsPreserved: true,
    note: "Изменений не внесено. Original IDs и суммы сохраняются; неоднозначное не связывается автоматически.",
  };
}

export const dryRun = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<DryRunResult> => {
    await requireAuthIfEnabled(ctx);
    return await dryRunCore(ctx);
  },
});

export type ApplyMigrationResult = {
  ok: boolean;
  mode: "applied";
  runId: string;
  stats: Record<string, number>;
  ambiguities: MigrationAmbiguity[];
};

export async function applyMigrationCore(
  ctx: MutationCtx,
  { reason, limit }: { reason: string; limit?: number },
): Promise<ApplyMigrationResult> {
  if (!reason.trim()) throw new Error("Основание миграции обязательно");
  const [contracts, simCards, expenses, invoices, imports, assignments] = await Promise.all([
    ctx.db.query("contracts").collect(),
    ctx.db.query("simCards").collect(),
    ctx.db.query("expenses").collect(),
    ctx.db.query("invoices").collect(),
    ctx.db.query("billingImports").collect(),
    ctx.db.query("simAssignments").collect(),
  ]);
  const plan = computePlan({ contracts, simCards, expenses, invoices, imports, assignments });
  const cap = Math.max(1, Math.min(limit ?? 100000, 100000));

  const totalsBefore = plan.totalsBefore;
  let applied = 0;
  for (const p of plan.contractPatches.slice(0, cap)) {
    await ctx.db.patch(p.id, p.patch);
    applied += 1;
  }
  for (const p of plan.simPatches.slice(0, cap)) {
    await ctx.db.patch(p.id, p.patch);
    applied += 1;
  }
  for (const p of plan.expensePatches.slice(0, cap)) {
    await ctx.db.patch(p.id, p.patch);
    applied += 1;
  }
  for (const p of plan.invoicePatches.slice(0, cap)) {
    await ctx.db.patch(p.id, p.patch);
    applied += 1;
  }
  for (const a of plan.assignmentsToCreate.slice(0, cap)) {
    await ctx.db.insert("simAssignments", {
      simCardId: a.simCardId,
      employeeId: a.employeeId,
      contractId: a.contractId,
      assignedAt: a.assignedAt,
      createdAt: Date.now(),
    });
    applied += 1;
  }
  for (const link of plan.invoiceLinks.slice(0, cap)) {
    const inv = await ctx.db.get(link.invoiceId);
    if (inv && !inv.expenseId) {
      await ctx.db.patch(link.invoiceId, { expenseId: link.expenseId, status: "matched" });
      applied += 1;
    }
  }

  const after = await ctx.db.query("expenses").collect();
  const totalsAfter = roundMoney(
    after
      .filter((e) => !e.voided && e.kind !== "allocation" && e.status !== "cancelled")
      .reduce((acc, e) => acc + (e.total ?? e.amount + (e.vat ?? 0)), 0),
  );
  if (Math.abs(totalsBefore - totalsAfter) > 0.02) {
    throw new Error(`Миграция изменила итоги: было ${totalsBefore}, стало ${totalsAfter}`);
  }

  const runId = await ctx.db.insert("migrationRuns", {
    name: "additive-backfill-v1",
    mode: "applied",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    stats: JSON.stringify({ ...plan.stats, applied, totalsBefore, totalsAfter }).slice(0, 4000),
    ambiguities: JSON.stringify(plan.ambiguities.slice(0, 200)).slice(0, 4000),
    createdAt: Date.now(),
  });
  await writeAudit(ctx, {
    entityType: "migration",
    entityId: `${runId}`,
    action: "applied",
    reason,
    details: { applied, totalsBefore, totalsAfter, ambiguities: plan.ambiguities.length },
  });
  return {
    ok: true,
    mode: "applied",
    runId: `${runId}`,
    stats: { ...plan.stats, applied, totalsBefore, totalsAfter },
    ambiguities: plan.ambiguities.slice(0, 500),
  };
}

export const apply = mutation({
  args: { reason: v.string(), limit: v.optional(v.number()) },
  handler: async (
    ctx: MutationCtx,
    { reason, limit }: { reason: string; limit?: number },
  ): Promise<ApplyMigrationResult> => {
    await requireAuthIfEnabled(ctx);
    return await applyMigrationCore(ctx, { reason, limit });
  },
});

export const runs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx: QueryCtx,
    { limit }: { limit?: number },
  ): Promise<Doc<"migrationRuns">[]> => {
    await requireAuthIfEnabled(ctx);
    const all = await ctx.db.query("migrationRuns").collect();
    return [...all]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(1, Math.min(limit ?? 20, 200)));
  },
});
