import ExcelJS from "exceljs";

export type ImportRow = {
  rowIndex: number;
  phone: string;
  contractNumber: string;
  tariffName: string;
  periodStart: string;
  periodEnd: string;
  month: string;
  amount: number;
  vat: number;
  total: number;
  vatMismatch: boolean;
  tariffFee: number;
  isVatOnly: boolean;
};

const COLUMN = {
  phone: "Номер телефона",
  contract: "Договор",
  periodStart: "Дата начала периода",
  periodEnd: "Дата окончания периода",
  tariff: "Тарифный план",
  total: "Всего по строке",
  vat: "НДС",
  amount: "Итого по строке",
  tariffFee: "Абонентская плата по тарифному плану",
} as const;

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function normalizeContractNumber(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(Math.trunc(value));
  return String(value).trim();
}

function normalizePhone(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "number" ? String(Math.trunc(value)) : String(value);
  return raw.replace(/\D/g, "");
}

export function phoneVariants(value: unknown): string[] {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  if (normalized.length === 11 && normalized.startsWith("7")) {
    return [normalized, normalized.slice(1)];
  }
  if (normalized.length === 10) {
    return [normalized, `7${normalized}`];
  }
  return [normalized];
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  const date = new Date(utcValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const source = value instanceof Date ? value : null;
  if (source) {
    const dd = String(source.getDate()).padStart(2, "0");
    const mm = String(source.getMonth() + 1).padStart(2, "0");
    const yyyy = source.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = excelSerialToDate(value);
    if (parsed) {
      const dd = String(parsed.getUTCDate()).padStart(2, "0");
      const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = parsed.getUTCFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
  }
  return String(value).trim();
}

function monthLabel(dateText: string): string {
  const match = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "текущий период";
  const monthIndex = Number(match[2]) - 1;
  const year = match[3];
  const monthName = MONTHS[monthIndex] ?? "";
  return monthName ? `${monthName} ${year}` : "текущий период";
}

function cellPrimitive(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if (value instanceof Date) return value;
    if ("result" in value) return cellPrimitive(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    return null;
  }
  return value;
}

type ExcelBuffer = Parameters<ExcelJS.Xlsx["load"]>[0];

export async function parseRows(data: ArrayBuffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  // На runtime это настоящий Buffer; каст нужен только из-за расхождения
  // generic-типов Buffer между @types/node и типами exceljs.
  await workbook.xlsx.load(Buffer.from(data) as unknown as ExcelBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headerByIndex = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cellPrimitive(cell.value) ?? "").trim();
    if (text) headerByIndex.set(colNumber, text);
  });
  if (headerByIndex.size === 0) return [];

  const indexByHeader = new Map<string, number>();
  for (const [colNumber, header] of headerByIndex) {
    if (!indexByHeader.has(header)) indexByHeader.set(header, colNumber);
  }

  const getValue = (row: ExcelJS.Row, header: string): unknown => {
    const colNumber = indexByHeader.get(header);
    if (!colNumber) return null;
    return cellPrimitive(row.getCell(colNumber).value);
  };

  const rows: ImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const contractNumber = normalizeContractNumber(getValue(row, COLUMN.contract));
    if (!contractNumber) return;

    const phone = normalizePhone(getValue(row, COLUMN.phone));
    const isVatOnly = phone === "" || /^0+$/.test(phone);
    const tariffValue = getValue(row, COLUMN.tariff);
    const tariffName = tariffValue === null ? "" : String(tariffValue).trim();
    const periodStart = formatDate(getValue(row, COLUMN.periodStart));
    const periodEnd = formatDate(getValue(row, COLUMN.periodEnd));
    const amount = toNumber(getValue(row, COLUMN.amount));
    const vatFromTable = toNumber(getValue(row, COLUMN.vat));
    const totalFromTable = toNumber(getValue(row, COLUMN.total));
    const tariffFee = toNumber(getValue(row, COLUMN.tariffFee));
    const vat = vatFromTable;
    const resolvedTotal = totalFromTable > 0 ? totalFromTable : amount + vatFromTable;
    const vatMismatch = false;

    if (resolvedTotal <= 0 && vat <= 0 && amount <= 0) return;

    const month = monthLabel(periodEnd || periodStart);

    rows.push({
      rowIndex: rows.length + 1,
      phone,
      contractNumber,
      tariffName,
      periodStart,
      periodEnd,
      month,
      amount,
      vat,
      total: resolvedTotal,
      vatMismatch,
      tariffFee,
      isVatOnly,
    });
  });

  return rows;
}
