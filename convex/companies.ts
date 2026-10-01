import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { toPeriodKey } from "./_lib/accounting";
import { writeAudit } from "./_lib/audit";

export type CompanyListItem = {
  id: string;
  name: string;
  inn: string;
  kpp: string;
  comment: string;
  contracts: number;
  simCards: number;
  employees: number;
  monthlyExpense: number;
};

export type CompanyListResult = CompanyListItem[];

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<CompanyListResult> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [companies, contracts, simCards, employees] = await Promise.all([
      db.query("companies").collect(),
      db.query("contracts").collect(),
      db.query("simCards").collect(),
      db.query("employees").collect(),
    ]);

    const contractsByCompany = new Map<string, number>();
    for (const contract of contracts) {
      contractsByCompany.set(`${contract.companyId}`, (contractsByCompany.get(`${contract.companyId}`) ?? 0) + 1);
    }

    const simCardsByCompany = new Map<string, number>();
    for (const sim of simCards) {
      simCardsByCompany.set(`${sim.companyId}`, (simCardsByCompany.get(`${sim.companyId}`) ?? 0) + 1);
    }

    const employeesByCompany = new Map<string, number>();
    for (const employee of employees) {
      employeesByCompany.set(`${employee.companyId}`, (employeesByCompany.get(`${employee.companyId}`) ?? 0) + 1);
    }

    const expenses = (await db.query("expenses").collect()).filter(e => e.kind !== "allocation" && !e.voided && e.status !== "cancelled" && e.status !== "draft");
    const latestPeriod = expenses.map(e => e.periodKey || toPeriodKey(e.periodEnd ?? "") || toPeriodKey(e.month)).sort().at(-1);
    const expensesByCompany = new Map<string, number>();
    for (const expense of expenses) {
      if ((expense.periodKey || toPeriodKey(expense.periodEnd ?? "") || toPeriodKey(expense.month)) !== latestPeriod) continue;
      expensesByCompany.set(`${expense.companyId}`, (expensesByCompany.get(`${expense.companyId}`) ?? 0) + (expense.total ?? expense.amount + (expense.vat ?? 0)));
    }

    return [...companies]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({
        id: `${c._id}`,
        name: c.name,
        inn: c.inn ?? "",
        kpp: c.kpp ?? "",
        comment: c.comment ?? "",
        contracts: contractsByCompany.get(`${c._id}`) ?? 0,
        simCards: simCardsByCompany.get(`${c._id}`) ?? 0,
        employees: employeesByCompany.get(`${c._id}`) ?? 0,
        monthlyExpense: expensesByCompany.get(`${c._id}`) ?? 0,
      }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    inn: v.optional(v.string()),
    kpp: v.optional(v.string()),
    comment: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { name: string; inn?: string; kpp?: string; comment?: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    if (!args.name.trim()) throw new Error("Название компании обязательно");
    const existing = await db
      .query("companies")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      throw new Error("Компания с таким названием уже существует");
    }
    await db.insert("companies", {
      name: args.name.trim(),
      inn: args.inn?.trim() || undefined,
      kpp: args.kpp?.trim() || undefined,
      comment: args.comment,
      contracts: 0,
      simCards: 0,
      employees: 0,
      monthlyExpense: 0,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("companies"),
    name: v.string(),
    inn: v.optional(v.string()),
    kpp: v.optional(v.string()),
    comment: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"companies">; name: string; inn?: string; kpp?: string; comment?: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const existing = await db.get(args.id);
    if (!existing) throw new Error("Компания не найдена");
    if (!args.name.trim()) throw new Error("Название компании обязательно");
    const duplicate = await db
      .query("companies")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (duplicate && `${duplicate._id}` !== `${args.id}`) {
      throw new Error("Компания с таким названием уже существует");
    }
    await db.patch(args.id, {
      name: args.name.trim(),
      inn: args.inn?.trim() || undefined,
      kpp: args.kpp?.trim() || undefined,
      comment: args.comment,
    });
    await writeAudit(ctx, { entityType: "company", entityId: `${args.id}`, action: "updated" });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("companies") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"companies"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [hasContracts, hasSimCards, hasEmployees, hasExpenses] = await Promise.all([
      db.query("contracts").withIndex("by_company", (q) => q.eq("companyId", id)).take(1),
      db.query("simCards").withIndex("by_company", (q) => q.eq("companyId", id)).take(1),
      db.query("employees").withIndex("by_company", (q) => q.eq("companyId", id)).take(1),
      db.query("expenses").withIndex("by_company", (q) => q.eq("companyId", id)).take(1),
    ]);

    if (hasContracts.length || hasSimCards.length || hasEmployees.length || hasExpenses.length) {
      throw new Error("Нельзя удалить компанию: есть связанные записи (договоры/SIM/сотрудники/расходы)");
    }
    await db.delete(id);
    return { ok: true };
  },
});
