import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { expenseKindOf, isActiveExpense, roundMoney, toPeriodKey } from "./_lib/accounting";

function totalOf(e: { amount: number; vat?: number; total?: number }): number {
  return e.total ?? e.amount + (e.vat ?? 0);
}

export type InvoiceReconciliationResult = {
  invoiceId: string;
  kind: "invoice" | "detail";
  voided: boolean;
  chargeId?: string;
  chargeTotal: number;
  allocatedTotal: number;
  unallocated: number;
  allocationsCount: number;
  matched: boolean;
};

export const invoiceReconciliation = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (
    ctx: QueryCtx,
    { invoiceId }: { invoiceId: Id<"invoices"> },
  ): Promise<InvoiceReconciliationResult> => {
    await requireAuthIfEnabled(ctx);
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) throw new Error("Счёт не найден");
    const expenses = await ctx.db.query("expenses").collect();
    const charge = invoice.expenseId
      ? expenses.find((e) => `${e._id}` === `${invoice.expenseId}`)
      : expenses.find(
          (e) =>
            e.invoiceId &&
            `${e.invoiceId}` === `${invoiceId}` &&
            expenseKindOf(e) === "charge" &&
            !e.voided,
        );
    const allocations = expenses.filter(
      (e) =>
        expenseKindOf(e) === "allocation" &&
        isActiveExpense(e) &&
        ((charge && e.parentExpenseId && `${e.parentExpenseId}` === `${charge._id}`) ||
          (e.invoiceId && `${e.invoiceId}` === `${invoiceId}`)),
    );
    const chargeTotal = charge && isActiveExpense(charge) ? totalOf(charge) : 0;
    const allocatedTotal = roundMoney(allocations.reduce((acc, e) => acc + totalOf(e), 0));
    return {
      invoiceId: `${invoiceId}`,
      kind: invoice.kind,
      voided: invoice.voided ?? false,
      chargeId: charge ? `${charge._id}` : undefined,
      chargeTotal,
      allocatedTotal,
      unallocated: roundMoney(chargeTotal - allocatedTotal),
      allocationsCount: allocations.length,
      matched: chargeTotal === 0 || Math.abs(roundMoney(chargeTotal - allocatedTotal)) <= 0.02,
    };
  },
});

export type PeriodReconciliation = {
  periodKey: string;
  charges: number;
  allocations: number;
  chargeTotal: number;
  allocatedTotal: number;
  unallocated: number;
  unassignedToEmployee: number;
  byContract: { contract: string; charge: number; allocated: number; count: number; unallocated: number }[];
};

export const periodReconciliation = query({
  args: { periodKey: v.optional(v.string()), month: v.optional(v.string()) },
  handler: async (
    ctx: QueryCtx,
    args: { periodKey?: string; month?: string },
  ): Promise<PeriodReconciliation> => {
    await requireAuthIfEnabled(ctx);
    const want = args.periodKey ?? (args.month ? toPeriodKey(args.month) || args.month : undefined);
    const expenses = await ctx.db.query("expenses").collect();
    const active = expenses.filter((e) => isActiveExpense(e));
    const scoped = want
      ? active.filter((e) => (e.periodKey ?? toPeriodKey(e.month) ?? e.month) === want)
      : active;
    const charges = scoped.filter((e) => expenseKindOf(e) === "charge");
    const allocations = scoped.filter((e) => expenseKindOf(e) === "allocation");
    const chargeTotal = roundMoney(charges.reduce((acc, e) => acc + totalOf(e), 0));
    const allocatedTotal = roundMoney(allocations.reduce((acc, e) => acc + totalOf(e), 0));
    const unassigned = allocations.filter((e) => !e.employeeId).length;
    const byContract = new Map<string, { charge: number; allocated: number; count: number }>();
    for (const e of scoped) {
      const key = e.contractId ? `${e.contractId}` : (e.contract ?? "без договора");
      const entry = byContract.get(key) ?? { charge: 0, allocated: 0, count: 0 };
      if (expenseKindOf(e) === "charge") entry.charge = roundMoney(entry.charge + totalOf(e));
      else entry.allocated = roundMoney(entry.allocated + totalOf(e));
      entry.count += 1;
      byContract.set(key, entry);
    }
    return {
      periodKey: want ?? "",
      charges: charges.length,
      allocations: allocations.length,
      chargeTotal,
      allocatedTotal,
      unallocated: roundMoney(chargeTotal - allocatedTotal),
      unassignedToEmployee: unassigned,
      byContract: [...byContract.entries()].map(([contract, entry]) => ({
        contract,
        charge: entry.charge,
        allocated: entry.allocated,
        count: entry.count,
        unallocated: roundMoney(entry.charge - entry.allocated),
      })),
    };
  },
});

export type UnallocatedResult = {
  items: {
    id: string;
    month: string;
    periodKey?: string;
    contract: string;
    contractId?: string;
    simNumber: string;
    total: number;
    employeeId?: string;
  }[];
  totalCount: number;
};

export const unallocated = query({
  args: { periodKey: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (
    ctx: QueryCtx,
    args: { periodKey?: string; limit?: number },
  ): Promise<UnallocatedResult> => {
    await requireAuthIfEnabled(ctx);
    const expenses = await ctx.db.query("expenses").collect();
    let allocations = expenses.filter(
      (e) => expenseKindOf(e) === "allocation" && isActiveExpense(e) && !e.parentExpenseId,
    );
    if (args.periodKey) {
      allocations = allocations.filter(
        (e) => (e.periodKey ?? toPeriodKey(e.month) ?? e.month) === args.periodKey,
      );
    }
    const limit = Math.max(1, Math.min(args.limit ?? 200, 2000));
    return {
      items: allocations.slice(0, limit).map((e) => ({
        id: `${e._id}`,
        month: e.month,
        periodKey: e.periodKey,
        contract: e.contract ?? "",
        contractId: e.contractId ? `${e.contractId}` : undefined,
        simNumber: e.simNumber ?? "",
        total: totalOf(e),
        employeeId: e.employeeId ? `${e.employeeId}` : undefined,
      })),
      totalCount: allocations.length,
    };
  },
});
