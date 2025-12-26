import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";
import * as XLSX from "xlsx";
import type { Id } from "./_generated/dataModel";

type ImportRow = {
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

type NormalizedCompanyName = {
  raw: string;
  normalized: string;
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

function phoneVariants(value: unknown): string[] {
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

async function loadImportFile(ctx: { storage: { get: (id: string) => Promise<Blob | ArrayBuffer | null> } }, fileId: string) {
  const file = await ctx.storage.get(fileId);
  if (!file) throw new Error("Файл не найден");
  if (file instanceof ArrayBuffer) return file;
  return await file.arrayBuffer();
}

function parseRows(data: ArrayBuffer): ImportRow[] {
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

function normalizeName(value: string): NormalizedCompanyName {
  const raw = value.trim();
  const normalized = raw
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { raw, normalized };
}

function findSimilarCompanies(target: NormalizedCompanyName, companies: NormalizedCompanyName[]) {
  if (!target.normalized) return [];
  return companies.filter((c) => {
    if (!c.normalized) return false;
    if (c.normalized === target.normalized) return true;
    if (c.normalized.includes(target.normalized)) return true;
    if (target.normalized.includes(c.normalized)) return true;
    return false;
  });
}

export const requestUpload = mutation(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const uploadUrl = await ctx.storage.generateUploadUrl();
  return { uploadUrl };
});

export const saveUpload = mutation({
  args: {
    fileId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const importId = await ctx.db.insert("billingImports", {
      fileId: args.fileId,
      fileName: args.fileName,
      status: "uploaded",
      createdAt: Date.now(),
    });
    return { importId };
  },
});

export const get = query({
  args: { id: v.id("billingImports") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    return await ctx.db.get(id);
  },
});

export const preview = mutation({
  args: { id: v.id("billingImports") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const record = await ctx.db.get(id);
    if (!record) throw new Error("Импорт не найден");

    const data = await loadImportFile(ctx, record.fileId);
    const rows = parseRows(data);

    const [contracts, operators, simCards, tariffs] = await Promise.all([
      ctx.db.query("contracts").collect(),
      ctx.db.query("operators").collect(),
      ctx.db.query("simCards").collect(),
      ctx.db.query("tariffs").collect(),
    ]);

    const contractByNumber = new Map(contracts.map((c) => [c.number, c]));
    const operatorById = new Map(operators.map((o) => [o._id, o]));
    const tariffByKey = new Map(
      tariffs.map((t) => [`${t.operatorId}:${t.name.toLowerCase().trim()}`, t]),
    );
    const simByPhone = new Map<string, (typeof simCards)[number]>();
    simCards.forEach((s) => {
      for (const variant of phoneVariants(s.number)) {
        simByPhone.set(variant, s);
      }
    });

    const missingContracts = new Map<
      string,
      { rowsCount: number; periodStart?: string; periodEnd?: string }
    >();
    const missingSimCards = new Map<string, { contractNumber: string; tariffName: string }>();
    const missingTariffs = new Map<
      string,
      { operatorId: string; operatorName: string; contractNumber: string; tariffName: string }
    >();
    let totalAmount = 0;
    let totalVat = 0;
    let totalTotal = 0;

    const previewRows = rows.map((row) => {
      const issues: string[] = [];
      const contract = contractByNumber.get(row.contractNumber);
      totalAmount += row.amount;
      totalVat += row.vat;
      totalTotal += row.total;

      if (!contract) {
        issues.push("missingContract");
        const existing = missingContracts.get(row.contractNumber);
        missingContracts.set(row.contractNumber, {
          rowsCount: (existing?.rowsCount ?? 0) + 1,
          periodStart: existing?.periodStart ?? row.periodStart,
          periodEnd: existing?.periodEnd ?? row.periodEnd,
        });
      } else if (!row.isVatOnly) {
        const variants = phoneVariants(row.phone);
        const hasSim = variants.some((variant) => simByPhone.has(variant));
        if (variants.length && !hasSim) {
          issues.push("missingSim");
          const primary = variants[0];
          if (!missingSimCards.has(primary)) {
            missingSimCards.set(primary, {
              contractNumber: row.contractNumber,
              tariffName: row.tariffName,
            });
          }
        }

        const operator = operatorById.get(contract.operatorId);
        if (operator && row.tariffName) {
          const tariffKey = `${operator._id}:${row.tariffName.toLowerCase().trim()}`;
          if (!tariffByKey.has(tariffKey)) {
            issues.push("missingTariff");
            missingTariffs.set(tariffKey, {
              operatorId: `${operator._id}`,
              operatorName: operator.name,
              contractNumber: row.contractNumber,
              tariffName: row.tariffName,
            });
          }
        }
      }

      return {
        rowIndex: row.rowIndex,
        phone: row.phone,
        contractNumber: row.contractNumber,
        tariffName: row.tariffName,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        month: row.month,
        amount: row.amount,
        vat: row.vat,
        total: row.total,
        isVatOnly: row.isVatOnly,
        issues,
      };
    });

    return {
      importId: id,
      fileName: record.fileName,
      totals: {
        rows: rows.length,
        contractsMissing: missingContracts.size,
        simCardsMissing: missingSimCards.size,
        tariffsMissing: missingTariffs.size,
        totalAmount,
        totalVat,
        totalTotal,
      },
      rows: previewRows,
      missingContracts: Array.from(missingContracts.entries()).map(([contractNumber, info]) => ({
        contractNumber,
        rowsCount: info.rowsCount,
        periodStart: info.periodStart ?? "",
        periodEnd: info.periodEnd ?? "",
      })),
      missingSimCards: Array.from(missingSimCards.entries()).map(([phone, info]) => ({
        phone,
        contractNumber: info.contractNumber,
        tariffName: info.tariffName,
      })),
      missingTariffs: Array.from(missingTariffs.values()),
    };

    await ctx.db.patch(id, {
      status: "preview",
      previewSummary: {
        rows: rows.length,
        contractsMissing: missingContracts.size,
        simCardsMissing: missingSimCards.size,
        tariffsMissing: missingTariffs.size,
        totalAmount,
        totalVat,
        totalTotal,
      },
    });

    return response;
  },
});

export const apply = mutation({
  args: {
    id: v.id("billingImports"),
    contractResolutions: v.array(
      v.object({
        contractNumber: v.string(),
        company: v.union(
          v.object({
            mode: v.literal("existing"),
            id: v.id("companies"),
          }),
          v.object({
            mode: v.literal("create"),
            name: v.string(),
            inn: v.optional(v.string()),
            kpp: v.optional(v.string()),
            comment: v.optional(v.string()),
            forceCreate: v.optional(v.boolean()),
          }),
        ),
        operator: v.union(
          v.object({
            mode: v.literal("existing"),
            id: v.id("operators"),
          }),
          v.object({
            mode: v.literal("create"),
            name: v.string(),
            type: v.optional(v.string()),
            manager: v.optional(v.string()),
            phone: v.optional(v.string()),
            email: v.optional(v.string()),
          }),
        ),
        type: v.string(),
        status: v.union(v.literal("active"), v.literal("closing")),
        startDate: v.string(),
        endDate: v.string(),
        monthlyFee: v.number(),
        simCount: v.number(),
      }),
    ),
    simCardActions: v.optional(
      v.array(
        v.object({
          phone: v.string(),
          action: v.union(v.literal("create"), v.literal("skip")),
        }),
      ),
    ),
    tariffOverrides: v.optional(
      v.array(
        v.object({
          operatorId: v.id("operators"),
          tariffName: v.string(),
          monthlyFee: v.optional(v.number()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Импорт не найден");

    const data = await loadImportFile(ctx, record.fileId);
    const rows = parseRows(data);

    const [companies, operators, contracts, tariffs] = await Promise.all([
      ctx.db.query("companies").collect(),
      ctx.db.query("operators").collect(),
      ctx.db.query("contracts").collect(),
      ctx.db.query("tariffs").collect(),
    ]);

    const normalizedCompanies = companies.map((c) => ({
      id: c._id,
      ...normalizeName(c.name),
    }));

    const createCompanyRequests = args.contractResolutions.filter((c) => c.company.mode === "create");
    const companyConflicts = createCompanyRequests.flatMap((c) => {
      const target = normalizeName(c.company.name);
      if (c.company.forceCreate) return [];
      const suggestions = findSimilarCompanies(target, normalizedCompanies);
      if (!suggestions.length) return [];
      return [
        {
          contractNumber: c.contractNumber,
          name: c.company.name,
          suggestions: suggestions.map((s) => ({ id: s.id, name: s.raw })),
        },
      ];
    });

    if (companyConflicts.length) {
      return { ok: false, status: "needs_confirmation", companyConflicts };
    }

    const operatorByName = new Map(operators.map((o) => [o.name.toLowerCase().trim(), o]));
    const contractByNumber = new Map(contracts.map((c) => [c.number, c]));
    const tariffByKey = new Map(
      tariffs.map((t) => [`${t.operatorId}:${t.name.toLowerCase().trim()}`, t]),
    );

    const resolvedContractNumbers = new Set(args.contractResolutions.map((c) => c.contractNumber));
    const missingContracts = new Set<string>();
    rows.forEach((row) => {
      if (!contractByNumber.has(row.contractNumber) && !resolvedContractNumbers.has(row.contractNumber)) {
        missingContracts.add(row.contractNumber);
      }
    });
    if (missingContracts.size) {
      return {
        ok: false,
        status: "missing_contracts",
        missingContracts: Array.from(missingContracts.values()),
      };
    }

    const createdCompanies = new Map<string, string>();
    let contractsCreated = 0;
    let tariffsCreated = 0;
    let simCardsCreated = 0;
    let expensesCreated = 0;
    for (const resolution of createCompanyRequests) {
      const nameKey = normalizeName(resolution.company.name).normalized;
      if (createdCompanies.has(nameKey)) continue;
      const createdAt = Date.now();
      const companyId = await ctx.db.insert("companies", {
        name: resolution.company.name,
        inn: resolution.company.inn,
        kpp: resolution.company.kpp,
        comment: resolution.company.comment,
        contracts: 0,
        simCards: 0,
        employees: 0,
        monthlyExpense: 0,
        createdAt,
      });
      createdCompanies.set(nameKey, companyId);
    }

    const getCompanyId = (resolution: (typeof args.contractResolutions)[number]) => {
      if (resolution.company.mode === "existing") return resolution.company.id;
      const key = normalizeName(resolution.company.name).normalized;
      const created = createdCompanies.get(key);
      if (created) return created;
      throw new Error(`Не удалось создать компанию: ${resolution.company.name}`);
    };

    const createdOperators = new Map<string, string>();
    for (const resolution of args.contractResolutions) {
      if (resolution.operator.mode === "existing") continue;
      const key = resolution.operator.name.toLowerCase().trim();
      if (createdOperators.has(key)) continue;
      const existing = operatorByName.get(key);
      if (existing) {
        createdOperators.set(key, `${existing._id}`);
        continue;
      }
      const createdAt = Date.now();
      const operatorId = await ctx.db.insert("operators", {
        name: resolution.operator.name,
        type: resolution.operator.type,
        manager: resolution.operator.manager,
        phone: resolution.operator.phone,
        email: resolution.operator.email,
        contracts: 0,
        simCards: 0,
        createdAt,
      });
      createdOperators.set(key, operatorId);
    }

    const getOperatorId = (resolution: (typeof args.contractResolutions)[number]) => {
      if (resolution.operator.mode === "existing") return resolution.operator.id;
      const key = resolution.operator.name.toLowerCase().trim();
      const existing = createdOperators.get(key);
      if (existing) return existing;
      throw new Error(`Не удалось создать оператора: ${resolution.operator.name}`);
    };

    for (const resolution of args.contractResolutions) {
      if (contractByNumber.has(resolution.contractNumber)) continue;
      const companyId = getCompanyId(resolution);
      const operatorId = getOperatorId(resolution);
      const createdAt = Date.now();
      const contractId = await ctx.db.insert("contracts", {
        number: resolution.contractNumber,
        companyId,
        operatorId,
        type: resolution.type,
        status: resolution.status,
        startDate: resolution.startDate,
        endDate: resolution.endDate,
        monthlyFee: resolution.monthlyFee,
        simCount: resolution.simCount,
        createdAt,
      });
      contractsCreated += 1;
      contractByNumber.set(resolution.contractNumber, {
        _id: contractId,
        number: resolution.contractNumber,
        companyId,
        operatorId,
        type: resolution.type,
        status: resolution.status,
        createdAt,
      } as (typeof contracts)[number]);
    }

    const [freshOperators, simCards] = await Promise.all([
      ctx.db.query("operators").collect(),
      ctx.db.query("simCards").collect(),
    ]);
    const operatorNameById = new Map(freshOperators.map((o) => [o._id, o.name]));
    const simByPhone = new Map<string, (typeof simCards)[number]>();
    simCards.forEach((s) => {
      for (const variant of phoneVariants(s.number)) {
        simByPhone.set(variant, s);
      }
    });

    const simCardDecision = new Map<string, "create" | "skip">();
    (args.simCardActions ?? []).forEach((item) => {
      for (const variant of phoneVariants(item.phone)) {
        simCardDecision.set(variant, item.action);
      }
    });

    const tariffFeeByKey = new Map<string, number>();
    for (const row of rows) {
      if (!row.tariffName) continue;
      const contract = contractByNumber.get(row.contractNumber);
      if (!contract) continue;
      const key = `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`;
      const current = tariffFeeByKey.get(key) ?? 0;
      if (row.tariffFee > current) tariffFeeByKey.set(key, row.tariffFee);
    }

    const overrideFees = new Map(
      (args.tariffOverrides ?? []).map((t) => [
        `${t.operatorId}:${t.tariffName.toLowerCase().trim()}`,
        t.monthlyFee ?? 0,
      ]),
    );

    for (const row of rows) {
      const contract = contractByNumber.get(row.contractNumber);
      if (!contract) continue;
      if (!row.tariffName) continue;

      const tariffKey = `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`;
      if (tariffByKey.has(tariffKey)) continue;

      const monthlyFee = overrideFees.get(tariffKey) ?? tariffFeeByKey.get(tariffKey) ?? 0;
      const tariffId = await ctx.db.insert("tariffs", {
        name: row.tariffName,
        operatorId: contract.operatorId,
        monthlyFee,
        dataLimitGb: undefined,
        minutes: undefined,
        sms: undefined,
        status: "active",
        simCount: 0,
        createdAt: Date.now(),
      });
      tariffsCreated += 1;
      tariffByKey.set(tariffKey, {
        _id: tariffId,
        operatorId: contract.operatorId,
        name: row.tariffName,
      } as (typeof tariffs)[number]);
    }

    for (const row of rows) {
      const contract = contractByNumber.get(row.contractNumber);
      if (!contract) continue;
      if (row.isVatOnly) continue;
      if (!row.phone) continue;

      const variants = phoneVariants(row.phone);
      if (!variants.length) continue;
      if (variants.some((variant) => simByPhone.has(variant))) continue;
      if (simCardDecision.get(variants[0]) === "skip") continue;

      const tariffKey = row.tariffName
        ? `${contract.operatorId}:${row.tariffName.toLowerCase().trim()}`
        : "";
      let tariffId: string | undefined;
      if (tariffKey) {
        const existingTariff = tariffByKey.get(tariffKey);
        if (existingTariff) {
          tariffId = `${existingTariff._id}`;
        }
      }

      const simId = await ctx.db.insert("simCards", {
        number: row.phone,
        companyId: contract.companyId,
        operatorId: contract.operatorId,
        status: "active",
        type: row.tariffName || undefined,
        tariffId: tariffId ? (tariffId as Id<"tariffs">) : undefined,
        createdAt: Date.now(),
      });
      simCardsCreated += 1;
      const createdSim = { _id: simId } as (typeof simCards)[number];
      for (const variant of variants) {
        simByPhone.set(variant, createdSim);
      }
    }

    for (const row of rows) {
      const contract = contractByNumber.get(row.contractNumber);
      if (!contract) continue;
      const operatorName = operatorNameById.get(contract.operatorId) ?? "Оператор";
      const expenseType = row.isVatOnly ? "НДС" : row.tariffName || "Начисления по счету";
      await ctx.db.insert("expenses", {
        companyId: contract.companyId,
        type: expenseType,
        amount: row.amount,
        month: row.month,
        contract: row.contractNumber,
        operator: operatorName,
        vat: row.vat,
        total: row.total,
        status: "confirmed",
        hasDocument: true,
        createdAt: Date.now(),
      });
      expensesCreated += 1;
    }

    await ctx.db.patch(args.id, {
      status: "applied",
      appliedAt: Date.now(),
      appliedSummary: {
        expensesCreated,
        simCardsCreated,
        tariffsCreated,
        contractsCreated,
      },
    });
    return { ok: true, status: "applied" };
  },
});
