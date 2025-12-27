import type { ImportRow } from "./billingImportParser";

export type VatDistributionResult = {
  rows: ImportRow[];
  vatMismatches: number;
  distributedGroups: Set<string>;
};

const VAT_RATE = 0.2;
const EPSILON = 0.02;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function vatGroupKey(row: Pick<ImportRow, "contractNumber" | "month">): string {
  return `${row.contractNumber}::${row.month}`;
}

function vatOnlyValue(row: ImportRow): number {
  if (row.vat > 0) return row.vat;
  if (row.total > 0) return row.total;
  if (row.amount > 0) return row.amount;
  return 0;
}

export function applyVatDistribution(rows: ImportRow[]): VatDistributionResult {
  const adjusted = rows.map((row) => ({ ...row, vatMismatch: false }));
  const groups = new Map<
    string,
    {
      vatOnlyTotal: number;
      baseSum: number;
      rowIndexes: number[];
      vatOnlyIndexes: number[];
    }
  >();

  adjusted.forEach((row, index) => {
    const key = vatGroupKey(row);
    const group = groups.get(key) ?? { vatOnlyTotal: 0, baseSum: 0, rowIndexes: [], vatOnlyIndexes: [] };
    if (row.isVatOnly) {
      group.vatOnlyTotal += vatOnlyValue(row);
      group.vatOnlyIndexes.push(index);
    } else {
      group.baseSum += row.amount;
      group.rowIndexes.push(index);
    }
    groups.set(key, group);
  });

  let vatMismatches = 0;
  const distributedGroups = new Set<string>();

  groups.forEach((group, key) => {
    const { vatOnlyTotal, baseSum, rowIndexes } = group;
    if (vatOnlyTotal > 0 && baseSum > 0 && rowIndexes.length) {
      distributedGroups.add(key);
      let allocatedVat = 0;
      rowIndexes.forEach((rowIndex, idx) => {
        const row = adjusted[rowIndex];
        const isLast = idx === rowIndexes.length - 1;
        const vat = isLast
          ? roundCurrency(vatOnlyTotal - allocatedVat)
          : roundCurrency((vatOnlyTotal * row.amount) / baseSum);
        allocatedVat += vat;
        row.vat = vat;
        row.total = roundCurrency(row.amount + vat);
      });

      const expectedVat = roundCurrency(baseSum * VAT_RATE);
      const groupMismatch = Math.abs(vatOnlyTotal - expectedVat) > EPSILON;
      if (groupMismatch) {
        rowIndexes.forEach((rowIndex) => {
          adjusted[rowIndex].vatMismatch = true;
          vatMismatches += 1;
        });
      }
      return;
    }

    rowIndexes.forEach((rowIndex) => {
      const row = adjusted[rowIndex];
      const expectedTotal = roundCurrency(row.amount + row.vat);
      if (row.total > 0 && Math.abs(row.total - expectedTotal) > EPSILON) {
        row.vatMismatch = true;
        vatMismatches += 1;
      }
    });
  });

  return { rows: adjusted, vatMismatches, distributedGroups };
}
