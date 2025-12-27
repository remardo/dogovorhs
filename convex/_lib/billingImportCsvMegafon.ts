import type { ImportRow } from "./billingImportParser";

type ParsedMeta = {
  contractNumber: string;
  periodStart: string;
  periodEnd: string;
  month: string;
};

const VAT_RATE = 0.2;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractAllNumbers(value: string): number[] {
  const match = value.match(/-?\d+,\d{2}/g) ?? [];
  return match.map((item) => Number(item.replace(/\s/g, "").replace(",", ".")) || 0);
}

function extractNumber(value: string): number {
  const numbers = extractAllNumbers(value);
  return numbers.length ? numbers[numbers.length - 1] : 0;
}

function extractPhone(value: string): string {
  const match = value.match(/\b\d{10,11}\b/);
  return match ? match[0] : "";
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function extractTariff(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  const quote = value.match(/«([^»]+)»/);
  if (quote) return quote[1].trim();
  return value.replace(/Тарифный план на \d{2}\.\d{2}\.\d{4}/, "").trim();
}

function monthLabel(dateText: string): string {
  const match = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "текущий период";
  const monthIndex = Number(match[2]) - 1;
  const year = match[3];
  const monthName = [
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
  ][monthIndex];
  return monthName ? `${monthName} ${year}` : "текущий период";
}

function parseMeta(lines: string[]): ParsedMeta {
  let contractNumber = "";
  let periodStart = "";
  let periodEnd = "";
  for (const line of lines) {
    const periodMatch = line.match(/(\d{2}\.\d{2}\.\d{4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/);
    if (periodMatch) {
      periodStart = periodMatch[1];
      periodEnd = periodMatch[2];
    }
    const contractMatch = line.match(/Договор\s*№\s*([^\s]+)/i);
    if (contractMatch) {
      contractNumber = contractMatch[1];
    }
  }
  return { contractNumber, periodStart, periodEnd, month: monthLabel(periodEnd || periodStart) };
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/"/g, "").replace(/;+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function decodeCsv(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const tryDecode = (label: string) => {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      return "";
    }
  };
  return tryDecode("windows-1251") || tryDecode("utf-8") || "";
}

export function parseMegafonCsvRows(data: ArrayBuffer): ImportRow[] {
  const text = decodeCsv(data);
  const lines = normalizeLines(text);
  const meta = parseMeta(lines);

  const rows: ImportRow[] = [];
  let currentPhone = "";
  let currentTariff = "";
  let currentTotal = 0;
  let currentVat = 0;
  let expectTotals = false;

  const flush = () => {
    if (!currentPhone) return;
    const phone = normalizePhone(currentPhone);
    if (!phone) return;
    const total = currentTotal;
    const vat = currentVat || roundCurrency(total * (VAT_RATE / (1 + VAT_RATE)));
    const amount = roundCurrency(total - vat);
    if (total <= 0 && vat <= 0 && amount <= 0) return;
    rows.push({
      rowIndex: rows.length + 1,
      phone: phone.length === 10 ? `7${phone}` : phone,
      contractNumber: meta.contractNumber,
      tariffName: currentTariff,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      month: meta.month,
      amount,
      vat,
      total,
      vatMismatch: false,
      tariffFee: 0,
      isVatOnly: false,
    });
  };

  for (const line of lines) {
    if (line.includes("Абонентский номер")) {
      flush();
      currentPhone = extractPhone(line);
      currentTariff = "";
      currentTotal = 0;
      currentVat = 0;
      expectTotals = false;
      continue;
    }
    if (line.startsWith("Тарифный план")) {
      currentTariff = extractTariff(line);
      continue;
    }
    if (line.includes("Итого начислено")) {
      const numbers = extractAllNumbers(line);
      if (numbers.length) {
        currentTotal = numbers[numbers.length - 1];
        expectTotals = false;
      } else {
        expectTotals = true;
      }
      continue;
    }
    if (expectTotals) {
      const numbers = extractAllNumbers(line);
      if (numbers.length) {
        currentTotal = numbers[numbers.length - 1];
        expectTotals = false;
      }
    }
    if (line.includes("в том числе НДС")) {
      currentVat = extractNumber(line);
    }
    if (line.includes("не потреблялись")) {
      currentTotal = 0;
      currentVat = 0;
    }
  }
  flush();

  return rows;
}
