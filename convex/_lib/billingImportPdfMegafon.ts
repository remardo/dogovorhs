import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ImportRow } from "./billingImportParser";

type TextLine = { text: string };

const VAT_RATE = 0.2;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractNumber(value: string): number {
  const match = value.match(/-?\d+,\d{2}/g);
  if (!match || !match.length) return 0;
  const raw = match[match.length - 1];
  return Number(raw.replace(/\s/g, "").replace(",", ".")) || 0;
}

function extractAllNumbers(value: string): number[] {
  const match = value.match(/-?\d+,\d{2}/g) ?? [];
  return match.map((item) => Number(item.replace(/\s/g, "").replace(",", ".")) || 0);
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
  const fallback = value.replace(/^Тарифный план на \d{2}\.\d{2}\.\d{4}/, "").trim();
  return fallback;
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

async function extractLines(data: ArrayBuffer): Promise<TextLine[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: TextLine[] = [];
  for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex += 1) {
    const page = await doc.getPage(pageIndex);
    const content = await page.getTextContent();
    const byY = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const bucket = byY.get(y) ?? [];
      bucket.push({ x, text: item.str });
      byY.set(y, bucket);
    }
    const ordered = Array.from(byY.entries()).sort((a, b) => b[0] - a[0]);
    ordered.forEach(([, bucket]) => {
      const text = bucket
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        lines.push({ text });
      }
    });
  }
  return lines;
}

function extractPeriod(lines: TextLine[]) {
  for (const line of lines) {
    const match = line.text.match(/(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})/);
    if (match) {
      return { periodStart: match[1], periodEnd: match[2] };
    }
  }
  return { periodStart: "", periodEnd: "" };
}

function extractContractNumber(lines: TextLine[]) {
  for (const line of lines) {
    const match = line.text.match(/Договор.*№\s*([^\s]+)\s*от/i);
    if (match) return match[1];
  }
  return "";
}

export async function parseMegafonPdfRows(data: ArrayBuffer): Promise<ImportRow[]> {
  const lines = await extractLines(data);
  const { periodStart, periodEnd } = extractPeriod(lines);
  const contractNumber = extractContractNumber(lines);
  const month = monthLabel(periodEnd || periodStart);

  const rows: ImportRow[] = [];
  let currentPhone = "";
  let currentTariff = "";
  let currentTotal = 0;
  let currentVat = 0;
  let expectTotals = false;

  const flush = () => {
    if (!currentPhone) return;
    const normalizedPhone = normalizePhone(currentPhone);
    if (!normalizedPhone) return;
    const total = currentTotal;
    const vat = currentVat || roundCurrency(total * (VAT_RATE / (1 + VAT_RATE)));
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
      vatMismatch: false,
      tariffFee: 0,
      isVatOnly: false,
    });
  };

  for (const line of lines) {
    if (line.text.includes("Абонентский номер")) {
      flush();
      currentPhone = extractPhone(line.text);
      currentTariff = "";
      currentTotal = 0;
      currentVat = 0;
      expectTotals = false;
      continue;
    }
    if (line.text.startsWith("Тарифный план")) {
      currentTariff = extractTariff(line.text);
      continue;
    }
    if (line.text.includes("Итого") && line.text.includes("начислено")) {
      const numbers = extractAllNumbers(line.text);
      if (numbers.length) {
        currentTotal = numbers[numbers.length - 1];
        expectTotals = false;
      } else {
        expectTotals = true;
      }
      continue;
    }
    if (expectTotals) {
      const numbers = extractAllNumbers(line.text);
      if (numbers.length) {
        currentTotal = numbers[numbers.length - 1];
        expectTotals = false;
      }
    }
    if (line.text.includes("в том числе НДС")) {
      currentVat = extractNumber(line.text);
      continue;
    }
    if (line.text.includes("не потреблялись")) {
      currentTotal = 0;
      currentVat = 0;
    }
  }
  flush();

  return rows;
}
