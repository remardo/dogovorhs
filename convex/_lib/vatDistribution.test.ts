import { describe, expect, it } from "vitest";
import { applyVatDistribution } from "./vatDistribution";

const baseRow = {
  rowIndex: 1,
  phone: "79001234567",
  contractNumber: "A-1",
  tariffName: "Тариф",
  periodStart: "01.11.2025",
  periodEnd: "30.11.2025",
  month: "Ноябрь 2025",
  amount: 0,
  vat: 0,
  total: 0,
  vatMismatch: false,
  tariffFee: 0,
  isVatOnly: false,
};

describe("applyVatDistribution", () => {
  it("distributes VAT rows across base expenses", () => {
    const rows = [
      { ...baseRow, rowIndex: 1, amount: 100, total: 100 },
      { ...baseRow, rowIndex: 2, amount: 200, total: 200 },
      { ...baseRow, rowIndex: 3, isVatOnly: true, vat: 60, total: 60 },
    ];

    const result = applyVatDistribution(rows);
    expect(result.vatMismatches).toBe(0);
    expect(result.rows[0]).toMatchObject({ vat: 20, total: 120 });
    expect(result.rows[1]).toMatchObject({ vat: 40, total: 240 });
  });

  it("flags mismatch when VAT total does not match 20% base", () => {
    const rows = [
      { ...baseRow, rowIndex: 1, amount: 100, total: 100 },
      { ...baseRow, rowIndex: 2, amount: 200, total: 200 },
      { ...baseRow, rowIndex: 3, isVatOnly: true, vat: 50, total: 50 },
    ];

    const result = applyVatDistribution(rows);
    expect(result.vatMismatches).toBe(2);
    expect(result.rows[0]?.vatMismatch).toBe(true);
    expect(result.rows[1]?.vatMismatch).toBe(true);
  });

  it("validates totals when VAT is provided per row", () => {
    const rows = [
      { ...baseRow, rowIndex: 1, amount: 100, vat: 20, total: 120 },
      { ...baseRow, rowIndex: 2, amount: 100, vat: 20, total: 110 },
    ];

    const result = applyVatDistribution(rows);
    expect(result.rows[0]?.vatMismatch).toBe(false);
    expect(result.rows[1]?.vatMismatch).toBe(true);
    expect(result.vatMismatches).toBe(1);
  });
});
