import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseRows, phoneVariants } from "./billingImportParser";

async function buildWorkbook(rows: Record<string, unknown>[]): Promise<ArrayBuffer> {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((key) => row[key] ?? null));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Uint8Array.from(bytes).buffer;
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
  it("parses a valid row and derives totals/month", async () => {
    const data = await buildWorkbook([
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

    const [row] = await parseRows(data);
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
      vatMismatch: false,
      tariffFee: 500,
      isVatOnly: false,
    });
  });

  it("uses total when provided and skips zero rows", async () => {
    const data = await buildWorkbook([
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

    const rows = await parseRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(110);
    expect(rows[0]?.vatMismatch).toBe(false);
  });

  it("marks VAT-only rows when phone is empty or zeros", async () => {
    const data = await buildWorkbook([
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

    const rows = await parseRows(data);
    expect(rows[0]?.isVatOnly).toBe(true);
    expect(rows[1]?.isVatOnly).toBe(true);
    expect(rows[0]?.vatMismatch).toBe(false);
    expect(rows[1]?.vatMismatch).toBe(false);
  });

  it("skips rows without contract number", async () => {
    const data = await buildWorkbook([
      {
        "Номер телефона": "79001234567",
        "Договор": "",
        "Дата окончания периода": "30.11.2025",
        "Итого по строке": 100,
        "НДС": 0,
        "Всего по строке": 110,
      },
    ]);

    expect(await parseRows(data)).toHaveLength(0);
  });
});
