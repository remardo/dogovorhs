import { detectOperator } from "./invoiceParser";
/**
 * Additive accounting helpers (pure, no Convex imports).
 * Charge vs allocation, service periods, document identity, money checks.
 */

export const MONEY_EPSILON = 0.02;

const RU_MONTHS: Record<string, number> = {
  январь: 1, февраль: 2, март: 3, апрель: 4, май: 5, июнь: 6,
  июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

const RU_MONTH_NAMES = [
  "", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isValidMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e12;
}

/** Amount + VAT reconciliation. Returns mismatch (0 when within epsilon). */
export function moneyMismatch(amount: number, vat: number, total: number): number {
  const expected = roundMoney(amount + vat);
  return Math.abs(roundMoney(total) - expected) > MONEY_EPSILON
    ? roundMoney(total - expected)
    : 0;
}

export function checkMoneyTriple(amount: number, vat: number, total: number): void {
  if (!isValidMoney(amount) || !isValidMoney(vat) || !isValidMoney(total)) {
    throw new Error("Некорректные денежные суммы");
  }
  if (amount < 0 || total < 0) {
    throw new Error("Отрицательные суммы требуют явной корректировки");
  }
  if (vat < 0) {
    throw new Error("Отрицательный НДС требует явной корректировки");
  }
  const mismatch = moneyMismatch(amount, vat, total);
  if (mismatch !== 0) {
    throw new Error(`Суммы не сходятся: amount + vat != total (расхождение ${mismatch})`);
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/** Strict ISO date (YYYY-MM-DD) with real calendar validation. Returns "" when invalid. */
export function parseIsoDate(value: string): string {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isRealCalendarDate(year, month, day)) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Strict DMY date (DD.MM.YYYY) with real calendar validation. Returns "" when invalid. */
export function parseDmyDate(value: string): string {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!isRealCalendarDate(year, month, day)) return "";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** DMY -> ISO. Returns "" when invalid. */
export function dmyToIso(dateText: string): string {
  const dmy = parseDmyDate(dateText);
  if (!dmy) return "";
  const [day, month, year] = dmy.split(".");
  return `${year}-${month}-${day}`;
}

/** ISO -> DMY. Returns "" when invalid. */
export function isoToDmy(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  const [year, month, day] = parsed.split("-");
  return `${day}.${month}.${year}`;
}

/** Normalize any accepted date representation to ISO. Returns "" when invalid. */
export function toIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return parseIsoDate(trimmed) || dmyToIso(trimmed);
}

/** "2025-11-30" (ISO) -> "2025-11". Returns "" when invalid. */
export function periodKeyFromIso(iso: string): string {
  const parsed = parseIsoDate(iso);
  return parsed ? parsed.slice(0, 7) : "";
}

/** "01.11.2025" (DMY, calendar-validated) -> "2025-11". Returns "" when invalid. */
export function periodKeyFromDmy(dateText: string): string {
  const dmy = parseDmyDate(dateText);
  if (!dmy) return "";
  const [, month, year] = dmy.split(".");
  return `${year}-${month}`;
}

/** "Ноябрь 2025" / "ноября 2025" -> "2025-11". Returns "" when unparseable. */
export function periodKeyFromMonthLabel(month: string): string {
  const m = month.trim().match(/^([А-Яа-яЁё]+)\s+(\d{4})$/);
  if (!m) return "";
  const mi = RU_MONTHS[m[1].toLowerCase()];
  if (!mi) return "";
  return `${m[2]}-${String(mi).padStart(2, "0")}`;
}

/**
 * Any known period/date representation -> "YYYY-MM" or "".
 * Accepts ISO date, DMY date, YYYY-MM, Russian month label.
 */
export function toPeriodKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isPeriodKey(trimmed)) return trimmed;
  return (
    periodKeyFromIso(trimmed) ||
    periodKeyFromDmy(trimmed) ||
    periodKeyFromMonthLabel(trimmed) ||
    ""
  );
}

/** "2025-11" -> "Ноябрь 2025". */
export function monthLabelFromPeriodKey(periodKey: string): string {
  const m = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodKey;
  const name = RU_MONTH_NAMES[Number(m[2])] ?? "";
  return name ? `${name} ${m[1]}` : periodKey;
}

export function isPeriodKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Calendar compare for "YYYY-MM" (lexicographic works). */
export function comparePeriodKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Validate a service-period range. Accepts ISO or DMY endpoints. */
export function validatePeriodRange(periodStart: string, periodEnd: string): { startIso: string; endIso: string } {
  const startIso = toIsoDate(periodStart);
  const endIso = toIsoDate(periodEnd);
  if (!startIso) throw new Error(`Некорректная дата начала периода: ${periodStart || "пусто"}`);
  if (!endIso) throw new Error(`Некорректная дата конца периода: ${periodEnd || "пусто"}`);
  if (startIso > endIso) {
    throw new Error(`Начало периода позже конца: ${periodStart} > ${periodEnd}`);
  }
  return { startIso, endIso };
}

/** True when the range spans more than one calendar month (e.g. a quarter). */
export function isMultiMonthRange(periodStart: string, periodEnd: string): boolean {
  const startIso = toIsoDate(periodStart);
  const endIso = toIsoDate(periodEnd);
  if (!startIso || !endIso) return false;
  return startIso.slice(0, 7) !== endIso.slice(0, 7);
}

export function validatePeriodKey(periodKey: string): void {
  if (!isPeriodKey(periodKey)) {
    throw new Error(`Некорректный период: ${periodKey || "пусто"} (ожидается YYYY-MM)`);
  }
}

export function normalizeContractNumber(value: string): string {
  return value.replace(/[\s\-/\\_.]/g, "").toUpperCase();
}

export function normalizeOperatorName(value: string): string {
  return value.toLowerCase().replace(/["'`«»]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeInvoiceNo(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/^\/+|\/+$/g, "");
}

/**
 * Semantic document identity: operator + company + invoiceNo + invoiceDate + kind.
 * Deliberately independent of mutable totals/period/contract corrections so a
 * corrected re-registration resolves to the same document for explicit review.
 */
export function buildDocumentKey(parts: {
  operator: string;
  companyKey: string;
  invoiceNo: string;
  invoiceDate: string;
  kind: string;
}): string {
  const invoiceDateIso = toIsoDate(parts.invoiceNo.trim() ? parts.invoiceDate : parts.invoiceDate);
  if (!parts.invoiceNo.trim()) throw new Error("Номер документа обязателен для ключа");
  if (!invoiceDateIso) {
    throw new Error(`Некорректная дата документа: ${parts.invoiceDate || "пусто"}`);
  }
  return [
    normalizeOperatorName(detectOperator(parts.operator) || parts.operator),
    parts.companyKey.trim().toLowerCase(),
    normalizeInvoiceNo(parts.invoiceNo),
    invoiceDateIso,
    parts.kind,
  ].join("|");
}

/** Company part of the document key: bound company id, else normalized name. */
export function companyKeyFor(companyId?: string, companyName?: string): string {
  if (companyId) return `id:${companyId}`;
  return `name:${normalizeOperatorName(companyName ?? "")}`;
}

/** Legacy fingerprint helper (non-cryptographic, for row-level dedup only). */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}

/** Legacy expense without kind is a charge. */
export function expenseKindOf(expense: { kind?: string }): "charge" | "allocation" {
  return expense.kind === "allocation" ? "allocation" : "charge";
}

export function isActiveExpense(expense: { voided?: boolean; status?: string }): boolean {
  if (expense.voided) return false;
  if (expense.status === "cancelled" || expense.status === "draft") return false;
  return true;
}

export type ChargeLike = {
  amount: number;
  vat?: number;
  total?: number;
  kind?: string;
  voided?: boolean;
  status?: string;
};

export function chargeTotalOf(expense: ChargeLike): number {
  return expense.total ?? expense.amount + (expense.vat ?? 0);
}

/** Sum of charges only (allocations excluded), skipping voided. */
export function sumCharges(expenses: ChargeLike[]): number {
  return roundMoney(
    expenses
      .filter((e) => expenseKindOf(e) === "charge" && isActiveExpense(e))
      .reduce((acc, e) => acc + chargeTotalOf(e), 0),
  );
}

/** Sum of allocations only, skipping voided. */
export function sumAllocations(expenses: ChargeLike[]): number {
  return roundMoney(
    expenses
      .filter((e) => expenseKindOf(e) === "allocation" && isActiveExpense(e))
      .reduce((acc, e) => acc + chargeTotalOf(e), 0),
  );
}

export function unallocatedOf(chargeTotal: number, allocatedTotal: number): number {
  return roundMoney(chargeTotal - allocatedTotal);
}

export type ChargeCandidate = {
  id: string;
  companyId: string;
  contractId?: string;
  periodKey: string;
  amount: number;
  vat: number;
  total: number;
  invoiceId?: string;
};

/**
 * Import-first reuse: a later invoice may reuse an existing aggregate charge
 * only when exactly one unbound same-company/contract/period charge exists
 * with matching amount AND vat AND total.
 */
export function decideChargeReuse(
  candidates: ChargeCandidate[],
  scope: { companyId: string; contractId?: string; periodKey: string },
  sums: { amount: number; vat: number; total: number },
): { mode: "reuse"; chargeId: string } | { mode: "create" } | { mode: "review"; reason: string; count: number } {
  const scoped = candidates.filter(
    (c) =>
      `${c.companyId}` === `${scope.companyId}` &&
      (scope.contractId ? c.contractId && `${c.contractId}` === `${scope.contractId}` : true) &&
      c.periodKey === scope.periodKey &&
      !c.invoiceId,
  );
  if (scoped.length === 0) return { mode: "create" };
  const matching = scoped.filter(
    (c) =>
      Math.abs(roundMoney(c.amount) - roundMoney(sums.amount)) <= MONEY_EPSILON &&
      Math.abs(roundMoney(c.vat) - roundMoney(sums.vat)) <= MONEY_EPSILON &&
      Math.abs(roundMoney(c.total) - roundMoney(sums.total)) <= MONEY_EPSILON,
  );
  if (matching.length === 1 && scoped.length === 1) {
    return { mode: "reuse", chargeId: matching[0].id };
  }
  if (matching.length > 1) {
    return { mode: "review", reason: "ambiguous_charges", count: matching.length };
  }
  return { mode: "review", reason: "total_mismatch", count: scoped.length };
}

/**
 * Decide whether a detail group may attach to an existing charge.
 * Attach only when exactly one candidate charge exists for the same
 * contract+period and totals reconcile within epsilon.
 */
export function canAttachToCharge(
  candidateCharges: { id: string; total: number }[],
  groupTotal: number,
): { ok: boolean; reason: string; chargeId?: string } {
  if (candidateCharges.length === 0) {
    return { ok: false, reason: "no_charge" };
  }
  if (candidateCharges.length > 1) {
    return { ok: false, reason: "ambiguous_charges" };
  }
  const charge = candidateCharges[0];
  if (Math.abs(roundMoney(charge.total) - roundMoney(groupTotal)) > MONEY_EPSILON) {
    return { ok: false, reason: "total_mismatch" };
  }
  return { ok: true, reason: "matched", chargeId: charge.id };
}

export type AllocationCheck = {
  parent: {
    id: string;
    kind?: string;
    companyId: string;
    contractId?: string;
    periodKey?: string;
    month: string;
    total: number;
    voided?: boolean;
  };
  siblingTotal: number;
};

/** Validate a new allocation against its parent charge before insert. */
export function checkAllocationFits(
  allocation: { companyId: string; contractId?: string; periodKey: string; month: string; total: number },
  check: AllocationCheck,
): void {
  const parent = check.parent;
  if (!parent || parent.voided) throw new Error("Начисление-основание не найдено или аннулировано");
  if (expenseKindOf(parent) !== "charge") {
    throw new Error("Распределение может ссылаться только на начисление (charge)");
  }
  if (`${parent.companyId}` !== `${allocation.companyId}`) {
    throw new Error("Распределение и начисление относятся к разным компаниям");
  }
  const parentContract = parent.contractId ? `${parent.contractId}` : "";
  const allocContract = allocation.contractId ? `${allocation.contractId}` : "";
  if (parentContract || allocContract) {
    if (parentContract !== allocContract) {
      throw new Error("Распределение и начисление относятся к разным договорам");
    }
  }
  const parentPeriod = parent.periodKey ?? toPeriodKey(parent.month);
  if (parentPeriod !== allocation.periodKey) {
    throw new Error("Распределение и начисление относятся к разным периодам");
  }
  const fits = roundMoney(check.siblingTotal + allocation.total);
  if (fits - roundMoney(parent.total) > MONEY_EPSILON) {
    throw new Error(
      `Распределение превышает начисление: ${fits} > ${roundMoney(parent.total)}`,
    );
  }
}

export type AssignmentInterval = {
  simCardId: string;
  employeeId?: string;
  assignedAt: number;
  unassignedAt?: number;
};

/**
 * Historical attribution at the SERVICE period.
 * Returns the owner only when exactly one assignment fully covers the period.
 * Zero, several, or partial coverage stays unassigned (reported ambiguous).
 */
export function attributeEmployeeAtPeriod(
  assignments: AssignmentInterval[],
  simId: string,
  periodStartIso: string,
  periodEndIso: string,
): { employeeId?: string; ambiguous: boolean; reason?: string } {
  const start = new Date(`${periodStartIso}T00:00:00`).getTime();
  const end = new Date(`${periodEndIso}T23:59:59`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { ambiguous: true, reason: "unknown_period" };
  }
  const relevant = assignments.filter(
    (a) =>
      `${a.simCardId}` === `${simId}` &&
      a.employeeId &&
      a.assignedAt <= end &&
      (a.unassignedAt === undefined || a.unassignedAt === null || a.unassignedAt >= start),
  );
  if (relevant.length === 0) return { ambiguous: false };
  const covering = relevant.filter((a) => a.assignedAt <= start && (a.unassignedAt === undefined || a.unassignedAt === null || a.unassignedAt >= end));
  if (covering.length === 1 && relevant.length === 1) {
    return { employeeId: covering[0].employeeId, ambiguous: false };
  }
  return {
    ambiguous: true,
    reason: covering.length === 0 ? "partial_coverage" : "several_owners",
  };
}
