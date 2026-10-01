import { describe, expect, it } from "vitest";
import {
  expenseKindLabel,
  expenseKindOf,
  expenseTotal,
  isVoided,
  sumCharges,
} from "@/lib/expenseAccounting";

describe("expenseAccounting", () => {
  it("treats legacy rows without kind as charges", () => {
    expect(expenseKindOf({ amount: 100, vat: 20, total: 120 })).toBe("charge");
    expect(expenseKindOf({ kind: "allocation", amount: 10 })).toBe("allocation");
    expect(expenseKindLabel({ kind: "allocation", amount: 10 })).toBe("Детализация");
    expect(expenseKindLabel({ amount: 10 })).toBe("Счёт");
  });

  it("sums charges only, skipping allocations and voided rows", () => {
    const list = [
      { amount: 100, vat: 20, total: 120 },
      { kind: "allocation", amount: 60, vat: 0, total: 60 },
      { amount: 50, vat: 10, total: 60, status: "cancelled" },
      { amount: 200, vat: 40 },
    ];
    expect(sumCharges(list)).toBe(120 + 240);
    expect(expenseTotal({ amount: 200, vat: 40 })).toBe(240);
    expect(isVoided({ amount: 1, status: "cancelled" })).toBe(true);
    expect(isVoided({ amount: 1, voided: true })).toBe(true);
  });
});
