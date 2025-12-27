import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseRows, phoneVariants } from "./billingImportParser";

function buildWorkbook(rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const data = [headers, ...rows.map((row) => headers.map((key) => row[key] ?? null))];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as
    | ArrayBuffer
    | Uint8Array;
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("phoneVariants", () => {
  it("normalizes to 7 and 10-digit variants", () => {
    expect(phoneVariants("+7 (900) 123-45-67")).toEqual(["79001234567", "9001234567"]);
    expect(phoneVariants("9001234567")).toEqual(["9001234567", "79001234567"]);
  });

  it("returns a single normalized value for other lengths", () => {
    expect(phoneVariants("8 901 234 567")).toEqual(["8901234567", "78901234567"]);
  });
});

describe("parseRows", () => {
  it("parses a valid row and derives totals/month", () => {
    const data = buildWorkbook([
      {
        "Номер телефона": "7 (900) 123-45-67",
        "Договор": 123,
        "Тарифный план": "Тестовый",
        "Дата начала периода": "01.11.2025",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 1000,
        "НДС": 200,
        "Всего по строке": 0,
        "Абонентская плата по тарифному плану": 500,
      },
    ]);

    const [row] = parseRows(data);
    expect(row).toMatchObject({
      rowIndex: 1,
      phone: "79001234567",
      contractNumber: "123",
      tariffName: "Тестовый",
      periodStart: "01.11.2025",
      periodEnd: "30.11.2025",
      month: "Ноябрь 2025",
      amount: 1000,
      vat: 200,
      total: 1200,
      tariffFee: 500,
      isVatOnly: false,
    });
  });

  it("uses total when provided and skips zero rows", () => {
    const data = buildWorkbook([
      {
        "Номер телефона": "9001234567",
        "Договор": "A-1",
        "Тарифный план": "План",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 100,
        "НДС": 0,
        "Всего по строке": 110,
      },
      {
        "Номер телефона": "9001234567",
        "Договор": "A-2",
        "Тарифный план": "План",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 0,
        "НДС": 0,
        "Всего по строке": 0,
      },
    ]);

    const rows = parseRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(110);
  });

  it("marks VAT-only rows when phone is empty or zeros", () => {
    const data = buildWorkbook([
      {
        "Номер телефона": "",
        "Договор": "A-1",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 100,
        "НДС": 0,
        "Всего по строке": 110,
      },
      {
        "Номер телефона": "0000000000",
        "Договор": "A-2",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 100,
        "НДС": 0,
        "Всего по строке": 110,
      },
    ]);

    const rows = parseRows(data);
    expect(rows[0]?.isVatOnly).toBe(true);
    expect(rows[1]?.isVatOnly).toBe(true);
  });

  it("skips rows without contract number", () => {
    const data = buildWorkbook([
      {
        "Номер телефона": "79001234567",
        "Договор": "",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 100,
        "НДС": 0,
        "Всего по строке": 110,
      },
    ]);

    expect(parseRows(data)).toHaveLength(0);
  });
});
