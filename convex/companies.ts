import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
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

  const latestExpense = await db.query("expenses").withIndex("by_created").order("desc").take(1);
  const latestExpenseMonth = latestExpense[0]?.month;
  const expensesByCompany = new Map<string, number>();
  if (latestExpenseMonth) {
    const latestMonthExpenses = await db
      .query("expenses")
      .withIndex("by_month", (q) => q.eq("month", latestExpenseMonth))
      .collect();
    const getExpenseTotal = (expense: { amount: number; vat?: number; total?: number }) =>
      expense.total ?? expense.amount + (expense.vat ?? 0);
    for (const expense of latestMonthExpenses) {
      expensesByCompany.set(
        `${expense.companyId}`,
        (expensesByCompany.get(`${expense.companyId}`) ?? 0) + getExpenseTotal(expense),
      );
    }
  }

  return companies
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
});

export const create = mutation({
  args: {
    name: v.string(),
    inn: v.optional(v.string()),
    kpp: v.optional(v.string()),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const existing = await db
      .query("companies")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      throw new Error("Компания с таким названием уже существует");
    }
    const createdAt = Date.now();
    await db.insert("companies", {
      ...args,
      contracts: 0,
      simCards: 0,
      employees: 0,
      monthlyExpense: 0,
      createdAt,
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [hasContracts, hasSimCards, hasEmployees, hasExpenses] = await Promise.all([
      db
        .query("contracts")
        .withIndex("by_company", (q) => q.eq("companyId", id))
        .take(1),
      db
        .query("simCards")
        .withIndex("by_company", (q) => q.eq("companyId", id))
        .take(1),
      db
        .query("employees")
        .withIndex("by_company", (q) => q.eq("companyId", id))
        .take(1),
      db
        .query("expenses")
        .withIndex("by_company", (q) => q.eq("companyId", id))
        .take(1),
    ]);

    if (hasContracts.length || hasSimCards.length || hasEmployees.length || hasExpenses.length) {
      throw new Error("Нельзя удалить компанию: есть связанные записи (договоры/SIM/сотрудники/расходы)");
    }
    await db.delete(id);
    return { ok: true };
  },
});
