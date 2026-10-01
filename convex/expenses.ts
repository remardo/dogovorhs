import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import {
  checkAllocationFits,
  checkMoneyTriple,
  expenseKindOf,
  isActiveExpense,
  isMultiMonthRange,
  roundMoney,
  toPeriodKey,
  validatePeriodRange,
} from "./_lib/accounting";
import { writeAudit } from "./_lib/audit";

function totalsOf(e: { amount: number; vat?: number; total?: number }): number {
  return e.total ?? e.amount + (e.vat ?? 0);
}

export type ExpenseListItem = {
  id: string;
  companyId: string;
  company: string;
  contract: string;
  contractId?: string;
  operator: string;
  month: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  multiMonth: boolean;
  type: string;
  serviceCategory: string;
  tariffId?: string;
  tariffName: string;
  amount: number;
  vat: number;
  total: number;
  simNumber: string;
  simCardId?: string;
  employeeId?: string;
  invoiceId?: string;
  parentExpenseId?: string;
  importId?: string;
  kind: "charge" | "allocation";
  documentKey?: string;
  voided: boolean;
  voidReason: string;
  status: "confirmed" | "draft" | "adjusted" | "cancelled";
  hasDocument: boolean;
  basis: string;
  description?: string;
  sourcePage?: number;
  vatBasis?: string;
  serviceIdentifier?: string;
};

export type ExpenseListResult = {
  items: ExpenseListItem[];
  companies: { id: string; name: string }[];
  summary: {
    total: number;
    confirmed: number;
    draft: number;
    allocationTotal: number;
    chargesCount: number;
    allocationsCount: number;
    noDocs: number;
    totalCount: number;
  };
};

export type ExpenseInput = {
  companyId: Id<"companies">;
  contract?: string;
  contractId?: Id<"contracts">;
  operator?: string;
  month: string;
  type: string;
  serviceCategory?: string;
  amount: number;
  vat?: number;
  total?: number;
  simNumber?: string;
  simCardId?: Id<"simCards">;
  employeeId?: Id<"employees">;
  invoiceId?: Id<"invoices">;
  parentExpenseId?: Id<"expenses">;
  importId?: Id<"billingImports">;
  tariffId?: Id<"tariffs">;
  tariffName?: string;
  kind?: "charge" | "allocation";
  periodKey?: string;
  periodStart?: string;
  periodEnd?: string;
  status: "confirmed" | "draft" | "adjusted";
  hasDocument: boolean;
  basis?: string;
};

export async function assertExpenseLinks(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    contractId?: Id<"contracts">;
    simCardId?: Id<"simCards">;
    employeeId?: Id<"employees">;
    tariffId?: Id<"tariffs">;
  },
): Promise<void> {
  const company = await ctx.db.get(args.companyId);
  if (!company) throw new Error("Компания не найдена");
  if (args.contractId) {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Договор не найден");
    if (`${contract.companyId}` !== `${args.companyId}`) {
      throw new Error("Договор не принадлежит компании расхода");
    }
  }
  if (args.simCardId) {
    const sim = await ctx.db.get(args.simCardId);
    if (!sim) throw new Error("SIM-карта не найдена");
    if (`${sim.companyId}` !== `${args.companyId}`) {
      throw new Error("SIM-карта другой компании");
    }
    if (args.contractId && sim.contractId && `${sim.contractId}` !== `${args.contractId}`) {
      throw new Error("SIM-карта привязана к другому договору");
    }
  }
  if (args.employeeId) {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Сотрудник не найден");
    if (`${employee.companyId}` !== `${args.companyId}`) {
      throw new Error("Сотрудник другой компании");
    }
    if (employee.status === "fired") {
      throw new Error("Нельзя относить новый расход на уволенного сотрудника");
    }
  }
  if (args.tariffId) {
    const tariff = await ctx.db.get(args.tariffId);
    if (!tariff) throw new Error("Тариф не найден");
  }
}

/** Charges require an explicit source; allocations require a valid parent charge. */
export async function assertAllocationParent(
  ctx: MutationCtx,
  args: {
    kind: "charge" | "allocation";
    companyId: Id<"companies">;
    contractId?: Id<"contracts">;
    periodKey: string;
    month: string;
    total: number;
    parentExpenseId?: Id<"expenses">;
    excludeId?: Id<"expenses">;
  },
): Promise<void> {
  if (args.kind !== "allocation") return;
  if (!args.parentExpenseId) {
    throw new Error("Распределение требует ссылки на начисление (parentExpenseId)");
  }
  const parent = await ctx.db.get(args.parentExpenseId);
  if (!parent || parent.voided || parent.status === "cancelled") {
    throw new Error("Начисление-основание не найдено или аннулировано");
  }
  const siblings = await ctx.db
    .query("expenses")
    .withIndex("by_parent", (q) => q.eq("parentExpenseId", args.parentExpenseId))
    .collect();
  const siblingTotal = roundMoney(
    siblings
      .filter((s) => !s.voided && s.status !== "cancelled" && s._id!==args.excludeId)
      .reduce((acc, s) => acc + totalsOf(s), 0),
  );
  checkAllocationFits(
    {
      companyId: `${args.companyId}`,
      contractId: args.contractId ? `${args.contractId}` : undefined,
      periodKey: args.periodKey,
      month: args.month,
      total: args.total,
    },
    {
      parent: {
        id: `${parent._id}`,
        kind: parent.kind ?? "charge",
        companyId: `${parent.companyId}`,
        contractId: parent.contractId ? `${parent.contractId}` : undefined,
        periodKey: parent.periodKey,
        month: parent.month,
        total: totalsOf(parent),
        voided: parent.voided ?? false,
      },
      siblingTotal,
    },
  );
}

export async function createExpenseCore(
  ctx: MutationCtx,
  args: ExpenseInput,
): Promise<{ ok: boolean; id: string }> {
  if (!args.month.trim()) throw new Error("Период (month) обязателен");
  if (!args.type.trim()) throw new Error("Тип услуги обязателен");
  const vat = args.vat ?? 0;
  const total = args.total ?? roundMoney(args.amount + vat);
  checkMoneyTriple(args.amount, vat, total);
  const kind = args.kind ?? "charge";
  if (args.status === "adjusted" && !args.basis) {
    throw new Error("Ручная корректировка требует основания (basis)");
  }
  if (kind === "charge" && !args.invoiceId && !args.importId && !args.basis && !args.hasDocument) {
    throw new Error("Начисление требует источника: документ, импорт или явное основание");
  }
  if (args.periodStart && args.periodEnd) {
    validatePeriodRange(args.periodStart, args.periodEnd);
  }
  await assertExpenseLinks(ctx, {
    companyId: args.companyId,
    contractId: args.contractId,
    simCardId: args.simCardId,
    employeeId: args.employeeId,
    tariffId: args.tariffId,
  });
  const periodKey = args.periodKey ?? toPeriodKey(args.month);
  if (!periodKey) throw new Error(`Неизвестный период: ${args.month}`);
  if (kind === "allocation") {
    await assertAllocationParent(ctx, {
      kind,
      companyId: args.companyId,
      contractId: args.contractId,
      periodKey,
      month: args.month,
      total,
      parentExpenseId: args.parentExpenseId,
    });
  }
  const serviceCategory = args.serviceCategory ?? args.type;
  const id = await ctx.db.insert("expenses", {
    companyId: args.companyId,
    contract: args.contract,
    contractId: args.contractId,
    operator: args.operator,
    month: args.month,
    periodKey,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    multiMonth: args.periodStart && args.periodEnd ? isMultiMonthRange(args.periodStart, args.periodEnd) : false,
    type: serviceCategory,
    serviceCategory,
    amount: args.amount,
    vat,
    total,
    simNumber: args.simNumber,
    simCardId: args.simCardId,
    employeeId: args.employeeId,
    invoiceId: args.invoiceId,
    parentExpenseId: args.parentExpenseId,
    importId: args.importId,
    tariffId: args.tariffId,
    tariffName: args.tariffName,
    kind,
    status: args.status,
    hasDocument: args.hasDocument,
    basis: args.basis,
    createdAt: Date.now(),
  });
  await writeAudit(ctx, {
    entityType: "expense",
    entityId: `${id}`,
    action: "created",
    details: { kind, total },
  });
  return { ok: true, id: `${id}` };
}

export async function voidExpenseCore(
  ctx: MutationCtx,
  args: { id: Id<"expenses">; reason: string },
): Promise<{ ok: boolean }> {
  if (!args.reason.trim()) throw new Error("Причина аннулирования обязательна");
  const expense = await ctx.db.get(args.id);
  if (!expense) throw new Error("Расход не найден");
  if (expense.voided) return { ok: true };
  const now = Date.now();
  await ctx.db.patch(args.id, {
    voided: true,
    voidReason: args.reason,
    voidedAt: now,
    status: "cancelled",
  });
  if (expenseKindOf(expense) === "charge") {
    const children = await ctx.db
      .query("expenses")
      .withIndex("by_parent", (q) => q.eq("parentExpenseId", args.id))
      .collect();
    for (const child of children) {
      if (!child.voided) {
        await ctx.db.patch(child._id, {
          voided: true,
          voidReason: args.reason,
          voidedAt: now,
          status: "cancelled",
        });
      }
    }
  }
  await writeAudit(ctx, {
    entityType: "expense",
    entityId: `${args.id}`,
    action: "voided",
    reason: args.reason,
  });
  return { ok: true };
}

function toListItem(e: Doc<"expenses">, companyName: string): ExpenseListItem {
  const amount = e.amount;
  const vat = e.vat ?? 0;
  const total = e.total ?? amount + vat;
  return {
    id: `${e._id}`,
    companyId: `${e.companyId}`,
    company: companyName,
    contract: e.contract ?? "",
    contractId: e.contractId ? `${e.contractId}` : undefined,
    operator: e.operator ?? "",
    month: e.month,
    periodKey: e.periodKey ?? toPeriodKey(e.month),
    periodStart: e.periodStart ?? "",
    periodEnd: e.periodEnd ?? "",
    multiMonth: e.multiMonth ?? false,
    type: e.type,
    serviceCategory: e.serviceCategory ?? e.type,
    tariffId: e.tariffId ? `${e.tariffId}` : undefined,
    tariffName: e.tariffName ?? "",
    amount,
    vat,
    total,
    simNumber: e.simNumber ?? "",
    simCardId: e.simCardId ? `${e.simCardId}` : undefined,
    employeeId: e.employeeId ? `${e.employeeId}` : undefined,
    invoiceId: e.invoiceId ? `${e.invoiceId}` : undefined,
    parentExpenseId: e.parentExpenseId ? `${e.parentExpenseId}` : undefined,
    importId: e.importId ? `${e.importId}` : undefined,
    kind: expenseKindOf(e),
    documentKey: e.documentKey,
    voided: e.voided ?? false,
    voidReason: e.voidReason ?? "",
    status: e.status ?? "draft",
    hasDocument: e.hasDocument ?? false,
    basis: e.basis ?? "",
    description:e.description,sourcePage:e.sourcePage,vatBasis:e.vatBasis,serviceIdentifier:e.serviceIdentifier,
  };
}

export const list = query({
  args: {
    periodKey: v.optional(v.string()),
    month: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    contractId: v.optional(v.id("contracts")),
    employeeId: v.optional(v.id("employees")),
    kind: v.optional(v.union(v.literal("charge"), v.literal("allocation"))),
    includeVoided: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (
    ctx: QueryCtx,
    args: {
      periodKey?: string;
      month?: string;
      companyId?: Id<"companies">;
      contractId?: Id<"contracts">;
      employeeId?: Id<"employees">;
      kind?: "charge" | "allocation";
      includeVoided?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<ExpenseListResult> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const expenses = await db.query("expenses").order("desc").collect();
    const companies = await db.query("companies").collect();
    const companyById = new Map<string, string>(companies.map((c) => [`${c._id}`, c.name]));
    const wantPeriod = args.periodKey ?? (args.month ? toPeriodKey(args.month) || args.month : undefined);

    const filtered = expenses.filter((e) => {
      if (!args.includeVoided && !isActiveExpense(e)) return false;
      if (args.kind && expenseKindOf(e) !== args.kind) return false;
      if (args.companyId && `${e.companyId}` !== `${args.companyId}`) return false;
      if (args.contractId && (!e.contractId || `${e.contractId}` !== `${args.contractId}`)) return false;
      if (args.employeeId && (!e.employeeId || `${e.employeeId}` !== `${args.employeeId}`)) return false;
      if (wantPeriod) {
        const key = e.periodKey ?? toPeriodKey(e.month);
        if (key !== wantPeriod && e.month !== wantPeriod) return false;
      } else if (args.month) {
        if (e.month !== args.month) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    const totalCount = sorted.length;
    const offset = Math.max(0, args.offset ?? 0);
    const limit = args.limit !== undefined ? Math.max(1, Math.min(args.limit, 20000)) : sorted.length;
    const page = sorted.slice(offset, offset + limit);

    const items = page.map((e) =>
      toListItem(e, companyById.get(`${e.companyId}`) ?? "Компания"),
    );

    const charges = filtered.filter((e) => expenseKindOf(e) === "charge");
    const allocations = filtered.filter((e) => expenseKindOf(e) === "allocation");
    return {
      items,
      companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
      summary: {
        total: roundMoney(charges.reduce((acc, e) => acc + totalsOf(e), 0)),
        confirmed: roundMoney(
          charges.filter((e) => e.status === "confirmed").reduce((acc, e) => acc + totalsOf(e), 0),
        ),
        draft: roundMoney(
          charges.filter((e) => e.status === "draft").reduce((acc, e) => acc + totalsOf(e), 0),
        ),
        allocationTotal: roundMoney(allocations.reduce((acc, e) => acc + totalsOf(e), 0)),
        chargesCount: charges.length,
        allocationsCount: allocations.length,
        noDocs: filtered.filter((e) => !e.hasDocument).length,
        totalCount,
      },
    };
  },
});

const expenseInputValidator = {
  companyId: v.id("companies"),
  contract: v.optional(v.string()),
  contractId: v.optional(v.id("contracts")),
  operator: v.optional(v.string()),
  month: v.string(),
  type: v.string(),
  serviceCategory: v.optional(v.string()),
  amount: v.number(),
  vat: v.optional(v.number()),
  total: v.optional(v.number()),
  simNumber: v.optional(v.string()),
  simCardId: v.optional(v.id("simCards")),
  employeeId: v.optional(v.id("employees")),
  invoiceId: v.optional(v.id("invoices")),
  parentExpenseId: v.optional(v.id("expenses")),
  importId: v.optional(v.id("billingImports")),
  tariffId: v.optional(v.id("tariffs")),
  tariffName: v.optional(v.string()),
  kind: v.optional(v.union(v.literal("charge"), v.literal("allocation"))),
  periodKey: v.optional(v.string()),
  periodStart: v.optional(v.string()),
  periodEnd: v.optional(v.string()),
  status: v.union(v.literal("confirmed"), v.literal("draft"), v.literal("adjusted")),
  hasDocument: v.boolean(),
  basis: v.optional(v.string()),
};

export const create = mutation({
  args: expenseInputValidator,
  handler: async (ctx: MutationCtx, args: ExpenseInput): Promise<{ ok: boolean; id: string }> => {
    await requireAuthIfEnabled(ctx);
    return await createExpenseCore(ctx, args);
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"expenses"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const expense = await db.get(id);
    if (!expense) return { ok: false };
    const invoices = await db.query("invoices").collect();
    const referencedByInvoice = invoices.some(
      (inv) => inv.expenseId && `${inv.expenseId}` === `${id}`,
    );
    const children = await db
      .query("expenses")
      .withIndex("by_parent", (q) => q.eq("parentExpenseId", id))
      .collect();
    const hasChildren = children.some((e) => !e.voided);
    if (referencedByInvoice || hasChildren || expense.hasDocument || expense.importId) {
      throw new Error(
        "Нельзя удалить расход с документом/связями: используйте аннулирование (voidExpense)",
      );
    }
    await db.delete(id);
    await writeAudit(ctx, { entityType: "expense", entityId: `${id}`, action: "deleted" });
    return { ok: true };
  },
});

export const update = mutation({
  args: { ...expenseInputValidator, id: v.id("expenses") },
  handler: async (
    ctx: MutationCtx,
    args: ExpenseInput & { id: Id<"expenses"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const existing = await db.get(id);
    if (!existing) throw new Error("Расход не найден");
    if (existing.voided) throw new Error("Аннулированный расход нельзя редактировать");
    const vat = rest.vat ?? 0;
    const total = rest.total ?? roundMoney(rest.amount + vat);
    checkMoneyTriple(rest.amount, vat, total);
    if (rest.status === "adjusted" && !rest.basis) {
      throw new Error("Корректировка требует основания (basis)");
    }
    if (rest.periodStart && rest.periodEnd) {
      validatePeriodRange(rest.periodStart, rest.periodEnd);
    }
    await assertExpenseLinks(ctx, {
      companyId: rest.companyId,
      contractId: rest.contractId,
      simCardId: rest.simCardId,
      employeeId: rest.employeeId,
      tariffId: rest.tariffId,
    });
    if ((rest.kind ?? expenseKindOf(existing)) === "allocation") {
      await assertAllocationParent(ctx, {
        kind: "allocation",
        companyId: rest.companyId,
        contractId: rest.contractId,
        periodKey: rest.periodKey ?? toPeriodKey(rest.month),
        month: rest.month,
        total,
        parentExpenseId: rest.parentExpenseId ?? existing.parentExpenseId,
        excludeId:id,
      });
    }
    if ((rest.kind ?? expenseKindOf(existing)) === "charge") {
      const children=await db.query("expenses").withIndex("by_parent",q=>q.eq("parentExpenseId",id)).collect();
      if(roundMoney(children.filter(e=>!e.voided&&e.status!=="cancelled").reduce((s,e)=>s+totalsOf(e),0))>total)throw new Error("Начисление не может быть меньше его детализации");
    }
    await db.patch(id, { ...rest, vat, total });
    await writeAudit(ctx, { entityType: "expense", entityId: `${id}`, action: "updated" });
    return { ok: true };
  },
});

export const voidExpense = mutation({
  args: { id: v.id("expenses"), reason: v.string() },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"expenses">; reason: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    return await voidExpenseCore(ctx, args);
  },
});
