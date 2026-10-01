// Charge/allocation accounting helpers for the frontend.
//
// Model (see IMPLEMENTATION_PLAN.md): an expense row is either a charge
// (начисление: the document total) or an allocation (распределение: a
// per-number/per-employee slice of a charge). Legacy rows without any kind
// marker are charges. Financial summaries must count charges only;
// personal/number histories sum allocations plus directly numbered charges
// without including the parent charge (no double count).

export type ExpenseLike = {
  kind?: string | null;
  status?: string | null;
  voided?: boolean | null;
  amount: number;
  vat?: number | null;
  total?: number | null;
};

export function expenseKindOf(e: ExpenseLike): "allocation" | "charge" {
  if (e.kind === "allocation") return "allocation";
  return "charge";
}

export function isAllocation(e: ExpenseLike): boolean {
  return expenseKindOf(e) === "allocation";
}

export function isVoided(e: ExpenseLike): boolean {
  if (e.voided) return true;
  return e.status === "cancelled" || e.status === "void";
}

/** Total with legacy fallback amount + vat. */
export function expenseTotal(e: ExpenseLike): number {
  if (typeof e.total === "number" && Number.isFinite(e.total)) return e.total;
  return (e.amount ?? 0) + (e.vat ?? 0);
}

/** Sum of active charges only (allocations and voided rows excluded). */
export function sumCharges<T extends ExpenseLike>(list: T[]): number {
  return list.reduce((acc, e) => {
    if (isAllocation(e) || isVoided(e)) return acc;
    return acc + expenseTotal(e);
  }, 0);
}

export function countAllocations<T extends ExpenseLike>(list: T[]): number {
  return list.filter((e) => isAllocation(e) && !isVoided(e)).length;
}

/** Plain-language kind label (no technical jargon in the UI). */
export function expenseKindLabel(e: ExpenseLike): string {
  return isAllocation(e) ? "Детализация" : "Счёт";
}
