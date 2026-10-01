import type { ImportRow } from "./billingImportParser";



function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function stripThousands(value: string): string {
  return value.replace(/(\d)[\s\u00a0\u202f](?=\d)/g, "$1");
}

function extractAllNumbers(value: string): number[] {
  const compact = stripThousands(value);
  const match = compact.match(/-?\d+[,.]\d{2}/g) ?? [];
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
  const quoteMatch = value.match(/«([^»]+)»/);
  if (quoteMatch) return quoteMatch[1].trim();
  const angle = value.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  return value.replace(/^Тарифный план на \d{2}\.\d{2}\.\d{4}/, "").trim();
}

function monthLabel(dateText: string): string {
  const match = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "текущий период";
  const monthIndex = Number(match[2]) - 1;
  const year = match[3];
  const monthName = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ][monthIndex];
  return monthName ? `${monthName} ${year}` : "текущий период";
}

/**
 * Client-extracted detail text (pdfjs in browser) -> ImportRow[].
 * Same Megafon block structure as CSV/PDF parsers, but works on plain text
 * lines so the unreliable in-action PDF path can be bypassed.
 */
export function parseMegafonDetailTextRows(
  text: string,
  meta: { contractNumber: string; periodStart: string; periodEnd: string },
): ImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  let contractNumber = meta.contractNumber;
  let periodStart = meta.periodStart;
  let periodEnd = meta.periodEnd;
  if (!contractNumber || !periodStart || !periodEnd) {
    for (const line of lines) {
      if (!periodStart || !periodEnd) {
        const periodMatch = line.match(/(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})/);
        if (periodMatch) {
          if (!periodStart) periodStart = periodMatch[1];
          if (!periodEnd) periodEnd = periodMatch[2];
        }
      }
      if (!contractNumber) {
        const contractMatch = line.match(/Договор.*№\s*([^\s]+)\s*от/i) ?? line.match(/Договор\s*№\s*([^\s]+)/i);
        if (contractMatch) contractNumber = contractMatch[1];
      }
    }
  }
  const month = monthLabel(periodEnd || periodStart);
  const taxText=text;
  const taxRateMatch=taxText.match(/НДС[^\n\d]{0,8}(\d{1,2})\s*%/i);
  const vatRate=/без\s+НДС/i.test(taxText) ? 0 : taxRateMatch ? Number(taxRateMatch[1])/100 : undefined;

  const rows: ImportRow[] = [];
  let currentPhone = "";
  let currentTariff = "";
  let currentTotal = 0;
  let currentVat: number | undefined;
  let expectTotals = false;

  const flush = () => {
    if (!currentPhone) return;
    const normalizedPhone = normalizePhone(currentPhone);
    if (!normalizedPhone) return;
    const total = currentTotal;
    const vat = currentVat ?? (vatRate !== undefined ? roundCurrency(total * (vatRate / (1 + vatRate))) : 0);
    const amount = roundCurrency(total - vat);
    if (total <= 0 && vat <= 0 && amount <= 0) return;
    rows.push({
      rowIndex: rows.length + 1,
      phone: normalizedPhone,
      contractNumber,
      tariffName: currentTariff,
      periodStart,
      periodEnd,
      month,
      amount,
      vat,
      total,
      vatMismatch: currentVat === undefined && vatRate === undefined,
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
      currentVat = undefined;
      expectTotals = false;
      continue;
    }
    if (line.startsWith("Тарифный план")) {
      currentTariff = extractTariff(line);
      continue;
    }
    if (line.includes("Итого") && line.includes("начислено")) {
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
      continue;
    }
    if (line.includes("не потреблялись")) {
      currentTotal = 0;
      currentVat = undefined;
    }
  }
  flush();
  return rows;
}
