// Service-period helpers (YYYY-MM) shared by dashboard and history views.
//
// Backend month labels are heterogeneous free text (service months, day ranges
// like "12.03.2026 - 12.03.2026", ISO dates, Russian month names). These helpers
// parse best-effort into a stable YYYY-MM key for filtering/sorting and never
// invent data: unparseable labels map to "" ("Без периода").

const RU_MONTHS_NOM = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

const RU_MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const RU_MONTHS_LABEL = [
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function keyOf(year: number, month: number): string {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  if (month < 1 || month > 12) return "";
  if (year < 1990 || year > 2100) return "";
  return `${year}-${pad2(month)}`;
}

/** Normalize an arbitrary month/period label to a YYYY-MM service-period key. */
export function normalizePeriodKey(input: string | undefined | null): string {
  if (!input) return "";
  const raw = input.trim();
  if (!raw) return "";

  // Already canonical.
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;

  // MM.YYYY or MM/YYYY or YYYY.MM or YYYY/MM.
  let m = raw.match(/^(\d{1,2})[./](\d{4})$/);
  if (m) return keyOf(Number(m[2]), Number(m[1]));
  m = raw.match(/^(\d{4})[./](\d{1,2})$/);
  if (m) return keyOf(Number(m[1]), Number(m[2]));

  // ISO date or datetime: take its month.
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return keyOf(Number(m[1]), Number(m[2]));

  // Day range "dd.MM.yyyy - dd.MM.yyyy" (or single "dd.MM.yyyy"): use start date.
  m = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return keyOf(Number(m[3]), Number(m[2]));

  // Russian month names ("Октябрь 2026", "октября 2026", "октябрь, 2026").
  const lowered = raw.toLowerCase().replace(/[,г.]/g, " ");
  const yearMatch = lowered.match(/(19|20)\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : NaN;
  if (Number.isFinite(year)) {
    const nomIdx = RU_MONTHS_NOM.findIndex((name) => lowered.includes(name));
    if (nomIdx >= 0) return keyOf(year, nomIdx + 1);
    const genIdx = RU_MONTHS_GEN.findIndex((name) => lowered.includes(name));
    if (genIdx >= 0) return keyOf(year, genIdx + 1);
  }

  return "";
}

/** Human label for a YYYY-MM key ("Октябрь 2026"); "" renders as "Без периода". */
export function periodLabel(key: string): string {
  const m = key.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return "Без периода";
  return `${RU_MONTHS_LABEL[Number(m[2]) - 1]} ${m[1]}`;
}

/** Ascending calendar order; "" (unknown) sorts last. */
export function comparePeriodKeys(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

/** Latest (max) service period, ignoring unknown labels. */
export function latestPeriodKey(keys: Array<string | undefined | null>): string {
  let best = "";
  for (const k of keys) {
    const norm = normalizePeriodKey(k ?? "");
    if (!norm) continue;
    if (!best || norm > best) best = norm;
  }
  return best;
}

/** Distinct normalized keys from arbitrary labels, ascending. */
export function distinctSortedPeriodKeys(labels: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const label of labels) {
    const k = normalizePeriodKey(label ?? "");
    if (k) set.add(k);
  }
  return [...set].sort(comparePeriodKeys);
}
