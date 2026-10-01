import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import {
  comparePeriodKeys,
  expenseKindOf,
  isActiveExpense,
  monthLabelFromPeriodKey,
  roundMoney,
  toPeriodKey,
} from "./_lib/accounting";

export type DashboardSummary = {
  totalExpenses: number;
  scopedTotal: number;
  contracts: number;
  contractsTotal: number;
  simCards: number;
  employeesWithSim: number;
  month: string;
  periodKey: string;
};

export type DashboardResult = {
  summary: DashboardSummary;
  months: string[];
  periodKeys: string[];
  periods: { label: string; periodKey: string; total: number }[];
  companies: {
    id: string;
    name: string;
    contracts: number;
    contractsTotal: number;
    simCards: number;
    employees: number;
    monthlyExpense: number;
  }[];
  expensesByMonth: { month: string; periodKey: string; companies: { companyId: string; company: string; amount: number }[] }[];
  services: { name: string; value: number }[];
  recentContracts: {
    id: string;
    number: string;
    company: string;
    operator: string;
    type: string;
    status: "active" | "closing" | "archived";
    monthlyFee: number;
    startDate: string;
    endDate: string;
    simCount: number;
  }[];
};

export type DashboardArgs = {
  expensesLimit?: number;
  monthsLimit?: number;
  periodKey?: string;
  month?: string;
  fromPeriod?: string;
  toPeriod?: string;
  companyId?: Id<"companies">;
  contractId?: Id<"contracts">;
};

function expenseTotal(e: { amount: number; vat?: number; total?: number }): number {
  return e.total ?? e.amount + (e.vat ?? 0);
}

export async function getSummaryCore(ctx: QueryCtx, args: DashboardArgs): Promise<DashboardResult> {
  const { db } = ctx;
  const [companies, operators, contracts, simCards, employees] = await Promise.all([
    db.query("companies").collect(),
    db.query("operators").collect(),
    db.query("contracts").collect(),
    db.query("simCards").collect(),
    db.query("employees").collect(),
  ]);
  // Full period query: no hidden take(5000) truncation. Filter in JS by period.
  const allExpenses = await db.query("expenses").collect();
  const charges = allExpenses.filter(
    (e) => expenseKindOf(e) === "charge" && isActiveExpense(e),
  );
  const scoped = charges.filter((e) => {
    if (args.companyId && `${e.companyId}` !== `${args.companyId}`) return false;
    if (args.contractId && (!e.contractId || `${e.contractId}` !== `${args.contractId}`)) return false;
    return true;
  });

  const companyNameById = new Map<string, string>(companies.map((c) => [`${c._id}`, c.name]));

  // Calendar month set from service periods (periodKey), not createdAt.
  const totalsByPeriod = new Map<string, { total: number; month: string }>();
  for (const expense of scoped) {
    const key = expense.periodKey ?? toPeriodKey(expense.month) ?? expense.month;
    const entry = totalsByPeriod.get(key) ?? { total: 0, month: expense.month };
    entry.total = roundMoney(entry.total + expenseTotal(expense));
    totalsByPeriod.set(key, entry);
  }
  const allPeriods = [...totalsByPeriod.keys()].sort(comparePeriodKeys);

  const selectedPeriod =
    args.periodKey ?? (args.month ? toPeriodKey(args.month) || args.month : undefined);
  const from = args.fromPeriod;
  const to = args.toPeriod;
  const ranged = selectedPeriod !== undefined || from !== undefined || to !== undefined;
  const visiblePeriods = ranged
    ? allPeriods.filter(
        (p) =>
          (!selectedPeriod || p === selectedPeriod) &&
          (!from || p >= from) &&
          (!to || p <= to),
      )
    : allPeriods;
  const monthsLimit = Math.max(1, Math.min(args.monthsLimit ?? 12, 60));
  const monthsSorted = (ranged ? visiblePeriods : args.monthsLimit === 0 ? allPeriods : allPeriods.slice(-monthsLimit)).sort(
    comparePeriodKeys,
  );

  const inScope = (expense: { month: string; periodKey?: string }): boolean => {
    const key = expense.periodKey ?? toPeriodKey(expense.month) ?? expense.month;
    if (monthsSorted.length === 0) return false;
    return monthsSorted.includes(key);
  };

  const totalInScope = roundMoney(
    scoped.filter(inScope).reduce((acc, e) => acc + expenseTotal(e), 0),
  );

  // Company aggregates for the selected scope (empty scope => 0, not fallback data).
  const totalsByCompany = new Map<string, number>();
  for (const expense of scoped.filter(inScope)) {
    totalsByCompany.set(
      `${expense.companyId}`,
      roundMoney((totalsByCompany.get(`${expense.companyId}`) ?? 0) + expenseTotal(expense)),
    );
  }
  const companyAggregates = companies.map((company) => {
    const companyContracts = contracts.filter((c) => `${c.companyId}` === `${company._id}`);
    const activeContracts = companyContracts.filter((c) => c.status === "active").length;
    const companySimCards = simCards.filter((c) => c.companyId && `${c.companyId}` === `${company._id}`);
    const companyEmployees = employees.filter((e) => `${e.companyId}` === `${company._id}`);
    return {
      id: `${company._id}`,
      name: company.name,
      contracts: activeContracts,
      contractsTotal: companyContracts.length,
      simCards: companySimCards.length,
      employees: companyEmployees.length,
      monthlyExpense: totalsByCompany.get(`${company._id}`) ?? 0,
    };
  });

  const expensesByMonth = monthsSorted.map((period) => {
    const perCompany = new Map<string, number>();
    for (const expense of scoped) {
      const key = expense.periodKey ?? toPeriodKey(expense.month) ?? expense.month;
      if (key !== period) continue;
      perCompany.set(
        `${expense.companyId}`,
        roundMoney((perCompany.get(`${expense.companyId}`) ?? 0) + expenseTotal(expense)),
      );
    }
    return {
      month: totalsByPeriod.get(period)?.month ?? monthLabelFromPeriodKey(period),
      periodKey: period,
      total: totalsByPeriod.get(period)?.total ?? 0,
      companies: [...perCompany.entries()].map(([companyId, amount]) => ({
        companyId,
        company: companyNameById.get(companyId) ?? "Компания",
        amount,
      })),
    };
  });

  const latestPeriod = monthsSorted[monthsSorted.length - 1];
  const summary: DashboardSummary = {
    totalExpenses: selectedPeriod
      ? (totalsByPeriod.get(selectedPeriod)?.total ?? 0)
      : (latestPeriod ? (totalsByPeriod.get(latestPeriod)?.total ?? 0) : 0),
    scopedTotal: totalInScope,
    contracts: contracts.filter((c) => c.status === "active").length,
    contractsTotal: contracts.length,
    simCards: simCards.length,
    employeesWithSim: (() => {
      const byEmployee = new Set<string>();
      for (const sim of simCards) {
        if (sim.employeeId) byEmployee.add(`${sim.employeeId}`);
      }
      return byEmployee.size;
    })(),
    month: selectedPeriod
      ? (totalsByPeriod.get(selectedPeriod)?.month ?? selectedPeriod)
      : latestPeriod
        ? (totalsByPeriod.get(latestPeriod)?.month ?? latestPeriod)
        : "текущий период",
    periodKey: selectedPeriod ?? latestPeriod ?? "",
  };

  const serviceTypes: Record<string, number> = {};
  for (const expense of scoped.filter(inScope)) {
    const key = expense.serviceCategory ?? expense.type;
    serviceTypes[key] = roundMoney((serviceTypes[key] ?? 0) + expenseTotal(expense));
  }
  const services = Object.entries(serviceTypes).map(([name, value]) => ({ name, value }));

  const recentContracts = [...contracts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4)
    .map((contract) => ({
      id: `${contract._id}`,
      number: contract.number,
      company: companyNameById.get(`${contract.companyId}`) ?? "Компания",
      operator: operators.find((o) => `${o._id}` === `${contract.operatorId}`)?.name ?? "Оператор",
      type: contract.type,
      status: contract.status,
      monthlyFee: contract.monthlyFee ?? contract.amount ?? 0,
      startDate: contract.startDate ?? "",
      endDate: contract.endDate ?? "Бессрочный",
      simCount: contract.simCount ?? 0,
    }));

  void args.expensesLimit;
  return {
    summary,
    months: monthsSorted.map((p) => totalsByPeriod.get(p)?.month ?? monthLabelFromPeriodKey(p)),
    periodKeys: monthsSorted,
    periods: monthsSorted.map((p) => ({
      label: totalsByPeriod.get(p)?.month ?? monthLabelFromPeriodKey(p),
      periodKey: p,
      total: totalsByPeriod.get(p)?.total ?? 0,
    })),
    companies: companyAggregates,
    expensesByMonth: expensesByMonth.map((m) => ({
      month: m.month,
      periodKey: m.periodKey,
      companies: m.companies,
    })),
    services,
    recentContracts,
  };
}

export const getSummary = query({
  args: {
    expensesLimit: v.optional(v.number()),
    monthsLimit: v.optional(v.number()),
    periodKey: v.optional(v.string()),
    month: v.optional(v.string()),
    fromPeriod: v.optional(v.string()),
    toPeriod: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    contractId: v.optional(v.id("contracts")),
  },
  handler: async (ctx: QueryCtx, args: DashboardArgs): Promise<DashboardResult> => {
    await requireAuthIfEnabled(ctx);
    return await getSummaryCore(ctx, args);
  },
});
