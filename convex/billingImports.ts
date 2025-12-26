import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";
import type { Id } from "./_generated/dataModel";
import { phoneVariants } from "./_lib/billingImportParser";

type NormalizedCompanyName = {
  raw: string;
  normalized: string;
};

type NormalizedCompany = NormalizedCompanyName & { id: Id<"companies"> };


function normalizeName(value: string): NormalizedCompanyName {
  const raw = value.trim();
  const normalized = raw
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { raw, normalized };
}

function findSimilarCompanies(target: NormalizedCompanyName, companies: NormalizedCompany[]) {
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

export const getContext = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const [contracts, operators, simCards, tariffs] = await Promise.all([
    ctx.db.query("contracts").collect(),
    ctx.db.query("operators").collect(),
    ctx.db.query("simCards").collect(),
    ctx.db.query("tariffs").collect(),
  ]);
  return { contracts, operators, simCards, tariffs };
});

export const updatePreviewSummary = mutation({
  args: {
    id: v.id("billingImports"),
    summary: v.object({
      rows: v.number(),
      contractsMissing: v.number(),
      simCardsMissing: v.number(),
      tariffsMissing: v.number(),
      totalAmount: v.number(),
      totalVat: v.number(),
      totalTotal: v.number(),
    }),
  },
  handler: async (ctx, { id, summary }) => {
    await requireAuthIfEnabled(ctx);
    await ctx.db.patch(id, { status: "preview", previewSummary: summary });
    return { ok: true };
  },
});

const importRowSchema = v.object({
  rowIndex: v.number(),
  phone: v.string(),
  contractNumber: v.string(),
  tariffName: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  month: v.string(),
  amount: v.number(),
  vat: v.number(),
  total: v.number(),
  tariffFee: v.number(),
  isVatOnly: v.boolean(),
});

export const applyParsed = mutation({
  args: {
    id: v.id("billingImports"),
    rows: v.array(importRowSchema),
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

    const rows = args.rows;

    const [companies, operators, contracts, tariffs] = await Promise.all([
      ctx.db.query("companies").collect(),
      ctx.db.query("operators").collect(),
      ctx.db.query("contracts").collect(),
      ctx.db.query("tariffs").collect(),
    ]);

    const normalizedCompanies: NormalizedCompany[] = companies.map((c) => ({
      id: c._id,
      ...normalizeName(c.name),
    }));

    const createCompanyRequests = args.contractResolutions.filter(
      (c): c is typeof c & { company: { mode: "create"; name: string; inn?: string; kpp?: string; comment?: string; forceCreate?: boolean } } =>
        c.company.mode === "create",
    );
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

    const createdCompanies = new Map<string, Id<"companies">>();
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

    const getCompanyId = (resolution: (typeof args.contractResolutions)[number]): Id<"companies"> => {
      if (resolution.company.mode === "existing") return resolution.company.id;
      const key = normalizeName(resolution.company.name).normalized;
      const created = createdCompanies.get(key);
      if (created) return created;
      throw new Error(`Не удалось создать компанию: ${resolution.company.name}`);
    };

    const createdOperators = new Map<string, Id<"operators">>();
    for (const resolution of args.contractResolutions) {
      if (resolution.operator.mode === "existing") continue;
      const key = resolution.operator.name.toLowerCase().trim();
      if (createdOperators.has(key)) continue;
      const existing = operatorByName.get(key);
      if (existing) {
        createdOperators.set(key, existing._id);
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

    const getOperatorId = (resolution: (typeof args.contractResolutions)[number]): Id<"operators"> => {
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
        simNumber: row.isVatOnly ? undefined : row.phone || undefined,
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
