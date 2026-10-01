// Парсинг счетов (инвойсов) операторов: номер, дата, период, договор, л/с,
// абонент/ИНН, суммы. Портировано с локального экстрактора (см. invoices.csv сопроводительно),
// покрыто unit-тестами на реальных фрагментах.

export type ParsedInvoice = {
  invoiceNo: string;
  invoiceDate: string; // ISO YYYY-MM-DD
  periodStart: string; // DD.MM.YYYY
  periodEnd: string; // DD.MM.YYYY
  contractNumber: string;
  accountNumber: string;
  subscriber: string;
  subscriberInn: string;
  amount: number;
  vat: number;
  total: number;
  serviceTotal?: number;
  amountDue?: number;
  vatRate?: number;
  vatBasis?: string;
  notes: string[];
};

const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
  январь: 1, февраль: 2, март: 3, апрель: 4, май: 5, июнь: 6,
  июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
};

const KNOWN_INNS: Record<string, string> = {
  "2130116899": 'ООО "МКК "ФК"',
  "2130125646": 'ООО "ТЕХНО ПЛЮС"',
  "2130170511": 'ООО "ХОЛДИНГ СФЕРА"',
  "2130168738": 'ООО ПКО "ИНКАСС КОЛЛЕКТ"',
};

const OPERATOR_MARKERS: { name: string; markers: string[] }[] = [
  { name: "Вымпелком (Билайн)", markers: ["ВымпелКом", "beeline.ru", "БИЛАЙН"] },
  { name: "Мегафон", markers: ["МегаФон", "Мегафон"] },
  { name: "МТС", markers: ['ПАО "МТС"', "МТС-БАНК"] },
  { name: "Т2 Мобайл", markers: ["Т2 Мобайл", "Т2 МОБАЙЛ"] },
  { name: "Ростелеком", markers: ["РОСТЕЛЕКОМ", "Ростелеком"] },
  { name: "ЭР-Телеком", markers: ["ЭР-Телеком", "ЭР-ТЕЛЕКОМ", "b2b.dom.ru"] },
  { name: "Уфанет", markers: ["Уфанет", "УФАНЕТ"] },
  { name: "Связист", markers: ["Связист", "СВЯЗИСТ"] },
  { name: "Телеком.Ру", markers: ["ТЕЛЕКОМ.РУ"] },
  { name: "КТВС", markers: ["КТВС"] },
  { name: "МедиаКвант", markers: ["МедиаКвант", "МЕДИАКВАНТ"] },
  { name: "Вистлинк", markers: ["ВИСТЛИНК"] },
  { name: "Информационные Технологии", markers: ["ИНФОРМАЦИОННЫЕ ТЕХНОЛОГИИ"] },
  { name: "РУ.НЭТ", markers: ["Ру. Нэт", "РУ.НЭТ"] },
  { name: "Трайтэк", markers: ["Трайтэк", "ТРАЙТЭК"] },
  { name: "Мост", markers: ['ООО "Мост"', 'ООО "МОСТ"'] },
];

const NUM = "[\\d\\s\u00a0]+[.,]\\d{2,4}";
const NOSIGN = String.raw`(?:N9|№|¹|N)`;
// Одна группа = целая дата (во избежание путаницы индексов при двух датах в строке)
const DMY = String.raw`(\d{2}[.\s]\d{2}[.\s]\d{2,4})`;

function cyrRatio(text: string): number {
  const cyr = (text.match(/[Ѐ-џ]/g) ?? []).length;
  return cyr / Math.max(text.length, 1);
}


// macOS Roman (так pdfjs декодирует однобайтовую кириллицу) -> байты -> cp1251.
// Строки ASCII-совместимы, \u-escape для безопасности.
const MACROMAN_128 = "\u00c4\u00c5\u00c7\u00c9\u00d1\u00d6\u00dc\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00e7\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f1\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u2020\u00b0\u00a2\u00a3\u00a7\u2022\u00b6\u00df\u00ae\u00a9\u2122\u00b4\u00a8\u2260\u00c6\u00d8\u221e\u00b1\u2264\u2265\u00a5\u00b5\u2202\u2211\u220f\u03c0\u222b\u00aa\u00ba\u03a9\u00e6\u00f8\u00bf\u00a1\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u00c0\u00c3\u00d5\u0152\u0153\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u25ca\u00ff\u0178\u2044\u20ac\u2039\u203a\ufb01\ufb02\u2021\u00b7\u201a\u201e\u2030\u00c2\u00ca\u00c1\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u00d3\u00d4\uf8ff\u00d2\u00da\u00db\u00d9\u0131\u02c6\u02dc\u00af\u02d8\u02d9\u02da\u00b8\u02dd\u02db\u02c7";
const CP1251_128 = "\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f";

function macRomanToCp1251(line: string): string | null {
  const bytes: number[] = [];
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128) {
      bytes.push(code);
    } else {
      const idx = MACROMAN_128.indexOf(ch);
      bytes.push(idx === -1 ? 0x3f : 128 + idx);
    }
  }
  return bytes.map((b) => (b < 128 ? String.fromCharCode(b) : (CP1251_128[b - 128] ?? "?"))).join("");
}

export function fixMojibake(text: string): string {
  // Построчно: чиним только строки, которым становится лучше.
  return text
    .split("\n")
    .map((line) => {
      if (cyrRatio(line) >= 0.3 || line.length < 10) return line;
      const latin = latin1ToCp1251(line);
      const mac = macRomanToCp1251(line);
      let best = line;
      for (const cand of [latin, mac]) {
        if (cand !== null && cyrRatio(cand) > cyrRatio(best)) best = cand;
      }
      return best;
    })
    .join("\n");
}

function latin1ToCp1251(line: string): string | null {
  const bytes: number[] = [];
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 255) return null;
    bytes.push(code);
  }
  return cp1251Decode(bytes);
}

function cp1251Decode(bytes: number[]): string {
  return bytes
    .map((b) => (b < 128 ? String.fromCharCode(b) : (CP1251_128[b - 128] ?? "?")))
    .join("");
}

export function detectOperator(text: string): string {
  for (const { name, markers } of OPERATOR_MARKERS) {
    if (markers.some((m) => text.includes(m))) return name;
  }
  return "";
}

function normSpace(text: string): string {
  return text
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/(\d,\d{2})(\d)/g, "$1 $2")
    .replace(/(?<=\d)[оО](?=\d)/g, "0");
}

function parseNum(raw: string): number {
  let s = raw.trim().replace(/[\s\u00a0]/g, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parseRuDateParts(raw: string): [string, string, string] | null {
  const m = raw.trim().match(/(\d{1,2})\s+([А-Яа-яЁё]+)\s+(\d{2,4})/);
  if (!m) return null;
  const mi = MONTHS[m[2].toLowerCase()];
  if (!mi) return null;
  const year = m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3]);
  return [Number(m[1]).toString().padStart(2, "0"), String(mi).padStart(2, "0"), String(year)];
}

function parseRuDate(raw: string): string {
  const parts = parseRuDateParts(raw);
  return parts ? `${parts[2]}-${parts[1]}-${parts[0]}` : "";
}

function parseRuDateDmy(raw: string): string {
  const parts = parseRuDateParts(raw);
  return parts ? `${parts[0]}.${parts[1]}.${parts[2]}` : "";
}

function parseDmy(raw: string): string {
  const m = raw.trim().match(new RegExp(DMY));
  if (!m) return "";
  const parts = m[1].split(/[.\s]+/).filter(Boolean);
  if (parts.length !== 3) return "";
  const year = parts[2].length === 4 ? Number(parts[2]) : 2000 + Number(parts[2]);
  return `${Number(parts[0]).toString().padStart(2, "0")}.${String(Number(parts[1])).padStart(2, "0")}.${year}`;
}

function parseDmyIso(raw: string): string {
  const dmy = parseDmy(raw);
  const m = dmy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function findDateAfter(text: string, pos: number): string {
  const window = text.slice(pos, pos + 120);
  const m = window.match(new RegExp(DMY));
  if (m) return parseDmyIso(m[0]);
  const m2 = window.match(/от\s+(\d{1,2}\s+[А-Яа-яЁё]+\s+\d{2,4})/);
  if (m2) return parseRuDate(m2[1]);
  return "";
}

function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function normalizeContractNumber(value: string): string {
  return value.replace(/[\s\-/\\_.]/g, "").toUpperCase();
}

export function parseInvoiceText(rawText: string): ParsedInvoice {
  const text = normSpace(fixMojibake(rawText));
  const notes: string[] = [];
  const res: ParsedInvoice = {
    invoiceNo: "",
    invoiceDate: "",
    periodStart: "",
    periodEnd: "",
    contractNumber: "",
    accountNumber: "",
    subscriber: "",
    subscriberInn: "",
    amount: 0,
    vat: 0,
    total: 0,
    notes: [],
  };
  const rx = (pat: string) => text.match(new RegExp(pat, "i"));
  const money = (pat: string): number => {
    const mm = text.match(new RegExp(pat, "i"));
    return mm ? parseNum(mm[1]) : 0;
  };

  // --- счёт ---
  let m = rx(
    `[ССC]ч[её]т(?:\\s+на\\s+оплату)?\\s*${NOSIGN}\\s*([A-Za-zА-Яа-яЁё0-9][\\wА-Яа-яЁё\\-/\\.\\s]{0,30}?)\\s*(?=от(?=[\\s.,]|$)|$)`,
  );
  if (!m) {
    m = rx(
      `Счет\\s*(?:за\\s+[А-Яа-яЁё]+\\s+\\d{4}\\s*)?${NOSIGN}\\s*([\\d][\\d\\s/]{4,}?)\\s*(?=от(?=[\\s.,]|$)|$)`,
    );
  }
  if (!m) {
    m = rx(`Приложение к счету\\s*${NOSIGN}\\s*(\\d+)`);
  }
  if (m) {
    res.invoiceNo = m[1].replace(/\s+/g, " ").trim().replace(/^\/+|\/+$/g, "");
    const idx = text.indexOf(m[0]);
    res.invoiceDate = findDateAfter(text, idx);
  } else {
    notes.push("не найден номер счёта");
  }
  if (!res.invoiceDate) {
    const m2 = rx(/Дата выставления\s*(\d{1,2}\s+[А-Яа-яЁё]+\s+\d{4})/.source);
    if (m2) res.invoiceDate = parseRuDate(m2[1]);
  }

  // --- период ---
  let pm = rx(`за расч[её]тный период:?\\s*${DMY}\\s*[–—−Ц-]\\s*${DMY}`);
  if (pm) {
    res.periodStart = parseDmy(pm[1]);
    res.periodEnd = parseDmy(pm[2]);
  }
  if (!res.periodStart) {
    pm = rx(`за период с\\s*${DMY}\\s*по\\s*${DMY}`);
    if (pm) {
      res.periodStart = parseDmy(pm[1]);
      res.periodEnd = parseDmy(pm[2]);
    }
  }
  if (!res.periodStart) {
    pm = rx(
      `Оплата услуг за период\\s*(\\d{1,2}\\s+[А-Яа-яЁё]+\\s+\\d{4})[^0-9]{0,6}(\\d{1,2}\\s+[А-Яа-яЁё]+\\s+\\d{4})`,
    );
    if (pm) {
      res.periodStart = parseRuDateDmy(pm[1]);
      res.periodEnd = parseRuDateDmy(pm[2]);
    }
  }
  if (!res.periodStart) {
    pm = rx(`[Зз]а\\s+([А-Яа-яЁё]+)\\s+(\\d{4})`);
    if (pm && MONTHS[pm[1].toLowerCase()]) {
      const mi = MONTHS[pm[1].toLowerCase()];
      const y = Number(pm[2]);
      res.periodStart = `01.${String(mi).padStart(2, "0")}.${y}`;
      res.periodEnd = `${lastDay(y, mi)}.${String(mi).padStart(2, "0")}.${y}`;
    }
  }
  if (!res.periodStart) {
    // аванс за квартал: "интернет за 4 квартал 2026 г"
    pm = rx(`за\\s*(\\d)\\s*квартал\\s*(\\d{4})`);
    if (pm) {
      const q = Number(pm[1]);
      const y = Number(pm[2]);
      if (q >= 1 && q <= 4) {
        const m0 = (q - 1) * 3 + 1;
        const m1 = m0 + 2;
        res.periodStart = `01.${String(m0).padStart(2, "0")}.${y}`;
        res.periodEnd = `${lastDay(y, m1)}.${String(m1).padStart(2, "0")}.${y}`;
        notes.push("период — квартал из счёта (аванс)");
      }
    }
  }
  if (!res.periodStart) {
    // Авансовые счета без расчётного периода: единый период услуг в позициях
    // (напр. ЭР-Телеком: счёт от августа за октябрь). При смешанных — месяц счёта.
    const svc: [string, string][] = [];
    // "c" бывает латинской (документы ЭР-Телеком)
    const re = new RegExp(`[cс]\\s*${DMY}\\s*по\\s*${DMY}`, "gi");
    let sm: RegExpExecArray | null;
    while ((sm = re.exec(text)) !== null) {
      svc.push([parseDmy(sm[1]), parseDmy(sm[2])]);
    }
    const uniq = [...new Set(svc.map(([a, b]) => `${a}|${b}`))];
    if (svc.length > 0 && uniq.length === 1 && svc[0][0] && svc[0][1]) {
      res.periodStart = svc[0][0];
      res.periodEnd = svc[0][1];
      notes.push("период услуг из позиций счёта (аванс)");
    }
  }
  if (!res.periodStart && res.invoiceDate) {
    const [y, mo] = res.invoiceDate.split("-").map(Number);
    res.periodStart = `01.${String(mo).padStart(2, "0")}.${y}`;
    res.periodEnd = `${lastDay(y, mo)}.${String(mo).padStart(2, "0")}.${y}`;
    notes.push("период выведен из даты счёта");
  }

  // --- договор ---
  let cm = rx(`Договор\\s*${NOSIGN}\\s*(\\d{5,})`);
  if (!cm) {
    cm = rx(
      `Договор\\s*${NOSIGN}\\s*([A-Za-zА-Яа-яЁё0-9][\\wА-Яа-яЁё\\-/\\.\\s]{0,20}?)(?=\\s+от(?=[\\s.,]|$))`,
    );
  }
  if (!cm) {
    cm = rx(`[Пп]о договору(?:\\s*\\(контракту\\))?\\s*${NOSIGN}\\s*([A-Za-zА-Яа-яЁё0-9][\\wА-Яа-яЁё\\-/\\.]*[\\wА-Яа-яЁё]|\\d+)`);
  }
  if (!cm) {
    cm = rx(
      `Основание:\\s*(?=(?:Договор|[№¹N]|\\d))(?:Договор\\s*)?(?:${NOSIGN}\\s*)*([A-Za-zА-Яа-яЁё0-9][\\wА-Яа-яЁё\\-/\\.]*)`,
    );
  }
  if (!cm) {
    cm = rx(`Договор\\s+([A-Za-zА-Яа-яЁё0-9][\\wА-Яа-яЁё\\-/\\.]*)\\s+от\\s+\\d`);
  }
  if (!cm) {
    cm = rx(`(\\d{9,})\\s+от\\s+\\d{2}[.\\s]`);
  }
  if (!cm) {
    cm = rx(`Договор/лицевой счет:\\s*(\\S+)`);
  }
  if (!cm) {
    cm = rx(`по дог\\.\\s*([A-Za-zА-Яа-яЁё0-9][\\wА-Яа-яЁё\\-/\\.]*)\\s+от`);
  }
  if (cm) {
    res.contractNumber = cm[1].replace(/\s*-\s*/g, "-").trim().replace(/[.,]+$/, "");
  } else {
    notes.push("нет номера договора — потребуется ручное соотнесение");
  }

  // --- лицевой ---
  let am = rx(`Лицевой сч[её]т:?\\s*${NOSIGN}?\\s*(\\d[\\d ]{8,17})`);
  if (!am) am = rx(`Лицевой счет абонента\\s*(\\d[\\d\\s]*)`);
  if (!am) am = rx(`Лицев[А-Яа-яЁё\\w]*\\s+счет[А-Яа-яЁё\\w]*:?\\s*${NOSIGN}?\\s*(\\d[\\d ]{5,17})`);
  if (!am) am = rx(`(?:^|\\s)л/с\\s*${NOSIGN}?\\s*(\\d[\\d ]{5,17})`);
  if (!am) am = rx(`Лицевой счет(\\d{6,})`);
  if (am) res.accountNumber = am[1].replace(/\D/g, "");

  // --- абонент / ИНН ---
  const sm =
    rx(`Покупатель\\s+([^.]{3,120}?)(?:ИНН|$)`) ??
    rx(`Абонент:\\s*\n?\\s*(.+)`) ??
    rx(`Кому:\\s*(.+)`) ??
    rx(`Компания:\\s*(.+)`) ??
    rx(`Плательщик:\\s*(.+)`) ??
    rx(`Плательщик\\s+([^.]{3,120}?)(?:\\d{4}|ИНН|$)`);
  if (sm) {
    res.subscriber = sm[1].split("\n")[0].replace(/\s+/g, " ").replace(/^[,:\s]+|[,:\s]+$/g, "").slice(0, 120);
  }
  const innCandidates = text.match(/(?<!\d)(\d{10}|\d{12})(?!\d)/g) ?? [];
  for (const inn of innCandidates) {
    if (KNOWN_INNS[inn]) {
      res.subscriberInn = inn;
      res.subscriber = KNOWN_INNS[inn];
      break;
    }
  }
  if (!res.subscriberInn) {
    const upper = `${res.subscriber}\n${text}`.toUpperCase();
    const pairs: [string, string][] = [
      ["ТЕХНО ПЛЮС", "2130125646"],
      ["ХОЛДИНГ СФЕРА", "2130170511"],
      ["ИНКАСС КОЛЛЕКТ", "2130168738"],
      ["ПРОФЕССИОНАЛЬНАЯ КОЛЛЕКТОРСКАЯ", "2130168738"],
      ["МИКРОКРЕДИТНАЯ", "2130116899"],
      ["ИНКАСС", "2130168738"],
      ["МКК", "2130116899"],
    ];
    for (const [probe, inn] of pairs) {
      if (upper.includes(probe)) {
        res.subscriberInn = inn;
        res.subscriber = KNOWN_INNS[inn];
        notes.push("ИНН выведен по наименованию");
        break;
      }
    }
  }

  // --- суммы ---
  let amount = 0;
  let vat = 0;
  let total = 0;
  const rtTotals = rx(`Итого начислено:\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})`);
  if (rtTotals) {
    amount = parseNum(rtTotals[1]);
    vat = parseNum(rtTotals[2]);
    total = parseNum(rtTotals[3]);
  }
  if (!total) {
    const er = rx(`(${NUM})\\s*Общая сумма к оплате\\(рубль\\):\\s*(${NUM})`);
    if (er) {
      total = parseNum(er[1]);
      vat = parseNum(er[2]);
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    const t = money(`Сумма начислений \\(с учётом скидок и корректировок\\)\\s*(${NUM})`);
    if (t) {
      total = t;
      vat = money(`в том числе НДС\\s*\\(22%\\)\\s*(${NUM})`);
      if (!vat) {
        const line = rx(`Итого к оплате[^:\\n]*:([^\\n]+)`);
        if (line) {
          const nums = line[1].match(new RegExp(NUM, "g")) ?? [];
          if (nums.length >= 2) vat = parseNum(nums[nums.length - 2]);
        }
      }
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    const t = money(`Всего к оплате за период\\s*(${NUM})`);
    const line = rx(`Итого к оплате[^:\\n]*:([^\\n]+)`);
    if (t && line) {
      const nums = line[1].match(new RegExp(NUM, "g")) ?? [];
      if (nums.length >= 2) {
        total = t;
        vat = parseNum(nums[nums.length - 2]);
        amount = Math.round((total - vat) * 100) / 100;
      } else if (nums.length === 1) {
        total = t;
        vat = 0;
        amount = t;
      }
    }
  }
  if (!total) {
    const m = rx(`Итого\\s+начислено\\s*(${NUM})\\s*(${NUM})`);
    const v = money(`в том числе НДС\\s*\\(22%\\)\\s*(${NUM})`);
    if (m && v) {
      total = parseNum(m[2]);
      vat = v;
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    const t = money(`Общая сумма по счету\\s*(${NUM})`) || money(`Итого к оплате\\s*(${NUM})`);
    if (t) {
      total = t;
      vat = money(`НДС\\s*(${NUM})`);
      const a = money(`Услуги связи\\s*(${NUM})`);
      amount = a || Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    const t = money(`Израсходовано\\s+за\\s+период:\\s*(${NUM})`);
    if (t) {
      total = t;
      vat = money(`[Вв] том числе налог[а-я]*:\\s*(${NUM})`) || money(`Включая НДС\\s*(${NUM})`);
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    const m = rx(`Итого к оплате:\\s*(${NUM})\\s*руб\\., в том числе НДС\\s*\\(22%\\):\\s*(${NUM})`);
    if (m) {
      total = parseNum(m[1]);
      vat = parseNum(m[2]);
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    const m = rx(`(${NUM})\\s+(${NUM})\\s*22\\s*%\\s*(${NUM})`);
    if (m) {
      total = parseNum(m[1]);
      vat = parseNum(m[2]);
      amount = parseNum(m[3]);
    }
  }
  if (!total) {
    const m = rx(`Итого:\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})`);
    if (m) {
      amount = parseNum(m[1]);
      vat = parseNum(m[2]);
      total = parseNum(m[3]);
    }
  }
  if (!total) {
    const m = rx(`ИТОГО оказано услуг\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})`);
    if (m) {
      amount = parseNum(m[1]);
      vat = parseNum(m[2]);
      total = parseNum(m[3]);
    }
  }
  if (!total) {
    const t = money(`(?:Сумма|Итого) к оплате[^\\d:]*:?\\s*(${NUM})`);
    if (t) {
      total = t;
      vat = money(`В том числе НДС\\s*(${NUM})`);
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    // таблица, где суммы стоят строкой выше подписи "Итого:" (Уфанет).
    // Строка должна содержать ТОЛЬКО числа, иначе это позиции счёта.
    const itogoAt = text.search(/Итого:/i);
    if (itogoAt !== -1) {
      const before = text.slice(0, itogoAt).split("\n");
      let prev = "";
      for (let i = before.length - 1; i >= 0; i -= 1) {
        if (before[i].trim()) {
          prev = before[i].trim();
          break;
        }
      }
      const m = prev.match(new RegExp(`^(${NUM})\\s+(${NUM})\\s+(${NUM})$`));
      if (m) {
        amount = parseNum(m[1]);
        vat = parseNum(m[2]);
        total = parseNum(m[3]);
      }
    }
  }
  if (!total && /HflC|N9/.test(text)) {
    // МОСТ (OCR): суммы после якорей на разных строках.
    // Ветка только при OCR-маркерах, иначе затирает нормальные счета.
    const a = money(`Ито[rг]о:\\s*(${NUM})`);
    const v = money(`HflC[\\s\\S]{0,20}?:\\s*(${NUM})`);
    const tail = rx(`всего к\\s*оплате:`);
    let t = 0;
    if (tail && tail.index !== undefined) {
      const after = text.slice(tail.index + tail[0].length, tail.index + tail[0].length + 120);
      const nums = after.match(new RegExp(NUM, "g")) ?? [];
      if (nums.length) t = parseNum(nums[nums.length - 1]);
    }
    if (a && t) {
      amount = a;
      vat = v;
      total = t;
    }
  }
  if (!total) {
    const m = rx(`всего к оплате:\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})`);
    if (m) {
      amount = parseNum(m[1]);
      vat = parseNum(m[2]);
      total = parseNum(m[3]);
    }
  }
  if (!total) {
    const t = money(`Всего к оплате:\\s*(${NUM})`);
    if (t) {
      total = t;
      vat = money(`В том числе НДС:?\\s*(?:\\d+%:?\\s*)?(${NUM})`);
      amount = Math.round((total - vat) * 100) / 100;
    }
  }
  if (!total) {
    total = money(`Всего к оплате(?: за период)?[^\\d]*(${NUM})`) || money(`Сумма начислений[^\\n\\d]*\\s*(${NUM})`);
    vat = money(`в том числе НДС[^\\n]*?\\)\\s*(${NUM})`);
    amount = Math.round((total - vat) * 100) / 100;
  }
  const rate = text.match(/(?:НДС\s*[:(]?\s*|\s)(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  const taxFree = /без\s+НДС|НДС\s+не\s+облагается/i.test(text);
  res.vatRate = taxFree ? 0 : rate ? Number(rate[1].replace(",", ".")) : undefined;
  res.vatBasis = vat ? "explicit" : taxFree ? "taxFree" : "unknown";
  if (total && !vat && !taxFree && res.vatRate !== undefined) {
    amount = Math.round((total / (1 + res.vatRate / 100)) * 100) / 100;
    vat = Math.round((total - amount) * 100) / 100;
    res.vatBasis = "computedFromInvoiceRate";
    notes.push(`НДС расчётный (${res.vatRate}%)`);
  }
  const services = money(`Общая сумма начислений[^\\d]*(${NUM})`);
  if (services) res.serviceTotal = services;
  if (/Т2\s+Мобайл/i.test(text)) res.amountDue = total;
  res.amount = amount;
  res.vat = vat;
  res.total = total;
  if (!total) notes.push("не извлечены суммы");
  res.notes = notes;
  return res;
}

export function monthLabelFromPeriod(periodEnd: string): string {
  const iso = periodEnd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m = iso ? [iso[0], iso[3], iso[2], iso[1]] : periodEnd.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "текущий период";
  const names = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  return `${names[Number(m[2]) - 1] ?? ""} ${m[3]}`.trim() || "текущий период";
}
