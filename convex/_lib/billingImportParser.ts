import * as XLSX from "xlsx";

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
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = value.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const dd = String(parsed.d).padStart(2, "0");
      const mm = String(parsed.m).padStart(2, "0");
      const yyyy = parsed.y;
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

function readWorkbook(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  return XLSX.read(bytes, { type: "array" });
}

export function parseRows(data: ArrayBuffer): ImportRow[] {
  const workbook = readWorkbook(data);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  const rows: ImportRow[] = [];

  rawRows.forEach((row, index) => {
    const contractNumber = normalizeContractNumber(row[COLUMN.contract]);
    if (!contractNumber) return;

    const phone = normalizePhone(row[COLUMN.phone]);
    const tariffName = String(row[COLUMN.tariff] ?? "").trim();
    const periodStart = formatDate(row[COLUMN.periodStart]);
    const periodEnd = formatDate(row[COLUMN.periodEnd]);
    const amount = toNumber(row[COLUMN.amount]);
    const vat = toNumber(row[COLUMN.vat]);
    const total = toNumber(row[COLUMN.total]);
    const tariffFee = toNumber(row[COLUMN.tariffFee]);
    const resolvedTotal = total > 0 ? total : amount + vat;

    if (resolvedTotal <= 0 && vat <= 0 && amount <= 0) return;

    const isVatOnly = phone === "" || /^0+$/.test(phone);
    const month = monthLabel(periodEnd || periodStart);

    rows.push({
      rowIndex: index + 1,
      phone,
      contractNumber,
      tariffName,
      periodStart,
      periodEnd,
      month,
      amount,
      vat,
      total: resolvedTotal,
      tariffFee,
      isVatOnly,
    });
  });

  return rows;
}
