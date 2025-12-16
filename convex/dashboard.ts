import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const getSummary = query({
  args: {
    expensesLimit: v.optional(v.number()),
    monthsLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const companies = await db.query("companies").collect();
  const operators = await db.query("operators").collect();
  const contracts = await db.query("contracts").collect();
  const simCards = await db.query("simCards").collect();
  const employees = await db.query("employees").collect();
  const expensesLimit = Math.max(1, Math.min(args.expensesLimit ?? 5000, 50_000));
  const monthsLimit = Math.max(1, Math.min(args.monthsLimit ?? 12, 60));
  const expenses = await db.query("expenses").withIndex("by_created").order("desc").take(expensesLimit);

  const companyNameById = new Map(companies.map((c) => [c._id, c.name]));

  const latestExpense = await db.query("expenses").withIndex("by_created").order("desc").take(1);
  const latestExpenseMonth = latestExpense[0]?.month;
  const latestMonthExpenses = latestExpenseMonth
    ? await db.query("expenses").withIndex("by_month", (q) => q.eq("month", latestExpenseMonth)).collect()
    : [];
  const latestMonthTotalByCompany = new Map<string, number>();
  for (const expense of latestMonthExpenses) {
    latestMonthTotalByCompany.set(
      `${expense.companyId}`,
      (latestMonthTotalByCompany.get(`${expense.companyId}`) ?? 0) + expense.amount,
    );
  }

  const companyAggregates = companies.map((company) => {
    const companyContracts = contracts.filter((c) => c.companyId === company._id);
    const companySimCards = simCards.filter((c) => c.companyId && c.companyId === company._id);
    const companyEmployees = employees.filter((e) => e.companyId === company._id);
    const monthlyExpense = latestExpenseMonth ? latestMonthTotalByCompany.get(`${company._id}`) ?? 0 : 0;

    return {
      id: `${company._id}`,
      name: company.name,
      contracts: companyContracts.length,
      simCards: companySimCards.length,
      employees: companyEmployees.length,
      monthlyExpense,
    };
  });

  const monthMeta: Record<string, { total: number; lastCreated: number }> = {};
  const expensesByMonth = expenses.reduce<Record<string, { month: string; companies: { companyId: string; company: string; amount: number }[] }>>(
    (acc, expense) => {
      const month = expense.month;
      const companyName = companyNameById.get(expense.companyId) ?? "Компания";
      monthMeta[month] = {
        total: (monthMeta[month]?.total ?? 0) + expense.amount,
        lastCreated: Math.max(monthMeta[month]?.lastCreated ?? 0, expense.createdAt),
      };
      if (!acc[month]) {
        acc[month] = { month, companies: [] };
      }
      const monthEntry = acc[month];
      const existing = monthEntry.companies.find((c) => c.companyId === expense.companyId);
      if (existing) {
        existing.amount += expense.amount;
      } else {
        monthEntry.companies.push({
          companyId: `${expense.companyId}`,
          company: companyName,
          amount: expense.amount,
        });
      }
      return acc;
    },
    {},
  );

  const monthsSortedWithMeta = Object.entries(monthMeta)
    .sort((a, b) => b[1].lastCreated - a[1].lastCreated)
    .slice(0, monthsLimit)
    .map(([month, meta]) => ({ month, lastCreated: meta.lastCreated }));
  const monthsSorted = monthsSortedWithMeta.map((m) => m.month);

  const expensesByMonthArray = monthsSorted.map((month) => expensesByMonth[month]).filter(Boolean);

  const summary = {
    totalExpenses: monthMeta[monthsSorted[0]]?.total ?? 0,
    contracts: contracts.length,
    simCards: simCards.length,
    employeesWithSim: employees.filter((e) => e.simCount > 0).length,
    month: monthsSorted[0] ?? "текущий период",
  };

  const serviceTypes: Record<string, number> = {};
  for (const expense of expenses) {
    if (monthsSorted.length && !monthsSorted.includes(expense.month)) continue;
    serviceTypes[expense.type] = (serviceTypes[expense.type] ?? 0) + expense.amount;
  }
  const services = Object.entries(serviceTypes).map(([name, value]) => ({ name, value }));

  const recentContracts = contracts
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4)
    .map((contract) => ({
      id: `${contract._id}`,
      number: contract.number,
      company: companyNameById.get(contract.companyId) ?? "Компания",
      operator: operators.find((o) => o._id === contract.operatorId)?.name ?? "Оператор",
      type: contract.type,
      status: contract.status,
      monthlyFee: contract.monthlyFee ?? contract.amount ?? 0,
      startDate: contract.startDate ?? "",
      endDate: contract.endDate ?? "Бессрочный",
      simCount: contract.simCount ?? 0,
    }));

  return {
    summary,
    months: monthsSorted,
    periods: monthsSortedWithMeta.map(({ month, lastCreated }) => ({ label: month, createdAt: lastCreated })),
    companies: companyAggregates,
    expensesByMonth: expensesByMonthArray,
    services,
    recentContracts,
  };
  },
});
