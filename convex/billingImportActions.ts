import { action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";
import { parseRows, phoneVariants } from "./_lib/billingImportParser";
import { applyVatDistribution, vatGroupKey } from "./_lib/vatDistribution";
import type { Id } from "./_generated/dataModel";

async function loadImportFile(
  ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } },
  fileId: Id<"_storage">,
) {
  const file = await ctx.storage.get(fileId);
  if (!file) throw new Error("Файл не найден");
  return await file.arrayBuffer();
}

type ContractInfo = { number: string; operatorId: Id<"operators"> };
type OperatorInfo = { _id: Id<"operators">; name: string };
type SimCardInfo = { number: string };
type TariffInfo = { operatorId: Id<"operators">; name: string };

type ImportContext = {
  contracts: ContractInfo[];
  operators: OperatorInfo[];
  simCards: SimCardInfo[];
  tariffs: TariffInfo[];
};

type ImportRecord = { fileId: Id<"_storage">; fileName: string } | null;

type PreviewResponse = {
  importId: Id<"billingImports">;
  fileName: string;
  totals: {
    rows: number;
    contractsMissing: number;
    simCardsMissing: number;
    tariffsMissing: number;
    vatMismatches: number;
    totalAmount: number;
    totalVat: number;
    totalTotal: number;
  };
  rows: {
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
    isVatOnly: boolean;
    issues: string[];
  }[];
  missingContracts: { contractNumber: string; rowsCount: number; periodStart: string; periodEnd: string }[];
  missingSimCards: { phone: string; contractNumber: string; tariffName: string }[];
  missingTariffs: { operatorId: string; operatorName: string; contractNumber: string; tariffName: string }[];
};

type ApplyResult = { ok: boolean; status: string; missingContracts?: string[] };

const getImportRef = "billingImports:get" as any;
const getContextRef = "billingImports:getContext" as any;
const updatePreviewRef = "billingImports:updatePreviewSummary" as any;
const applyParsedRef = "billingImports:applyParsed" as any;

export const preview = action({
  args: { id: v.id("billingImports") },
  handler: async (ctx, { id }): Promise<PreviewResponse> => {
    await requireAuthIfEnabled(ctx);
    const record = (await ctx.runQuery(getImportRef, { id })) as ImportRecord;
    if (!record) throw new Error("Импорт не найден");

    const data = await loadImportFile(ctx, record.fileId);
    const parsedRows = parseRows(data);
    const { rows, vatMismatches, distributedGroups } = applyVatDistribution(parsedRows);

    const { contracts, operators, simCards, tariffs } = (await ctx.runQuery(
      getContextRef,
      {},
    )) as ImportContext;

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

    const missingContracts = new Map<string, { rowsCount: number; periodStart?: string; periodEnd?: string }>();
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
      const shouldSkipVatTotals = row.isVatOnly && distributedGroups.has(vatGroupKey(row));
      if (!shouldSkipVatTotals) {
        totalAmount += row.amount;
        totalVat += row.vat;
        totalTotal += row.total;
      }
      if (row.vatMismatch) {
        issues.push("vatMismatch");
      }

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
        vatMismatch: row.vatMismatch,
        isVatOnly: row.isVatOnly,
        issues,
      };
    });

    const response = {
      importId: id,
      fileName: record.fileName,
      totals: {
        rows: rows.length,
        contractsMissing: missingContracts.size,
        simCardsMissing: missingSimCards.size,
        tariffsMissing: missingTariffs.size,
        vatMismatches,
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

    await ctx.runMutation(updatePreviewRef, {
      id,
      summary: {
        rows: rows.length,
        contractsMissing: missingContracts.size,
        simCardsMissing: missingSimCards.size,
        tariffsMissing: missingTariffs.size,
        vatMismatches,
        totalAmount,
        totalVat,
        totalTotal,
      },
    });

    return response;
  },
});

export const apply = action({
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
  handler: async (ctx, args): Promise<ApplyResult> => {
    await requireAuthIfEnabled(ctx);
    const record = (await ctx.runQuery(getImportRef, { id: args.id })) as ImportRecord;
    if (!record) throw new Error("Импорт не найден");
    const data = await loadImportFile(ctx, record.fileId);
    const parsedRows = parseRows(data);
    const { rows, distributedGroups } = applyVatDistribution(parsedRows);
    const vatDistributionKeys = Array.from(distributedGroups.values());
    return (await ctx.runMutation(applyParsedRef, {
      ...args,
      rows,
      vatDistributionKeys,
    })) as ApplyResult;
  },
});
