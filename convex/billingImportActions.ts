"use node";

import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { parseRows, phoneVariants, type ImportRow } from "./_lib/billingImportParser";
import { parseMegafonCsvRows } from "./_lib/billingImportCsvMegafon";
import { parseMegafonDetailTextRows } from "./_lib/billingImportDetailText";
import { applyVatDistribution, vatGroupKey } from "./_lib/vatDistribution";
import { contentIdentity } from "./_lib/contentHash";
import type { CompanyConflict } from "./_lib/billingImportLogic";
import { api, internal } from "./_generated/api";
import type { ApplyParsedResult, ImportContextResult } from "./billingImports";

export type PreviewTotals = {
  rows: number;
  contractsMissing: number;
  simCardsMissing: number;
  tariffsMissing: number;
  vatMismatches: number;
  totalAmount: number;
  totalVat: number;
  totalTotal: number;
};

export type PreviewRow = {
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
  vatMismatch: boolean;
  isVatOnly: boolean;
  issues: string[];
};

export type PreviewResponse = {
  importId: Id<"billingImports">;
  fileName: string;
  contentSha256: string;
  totals: PreviewTotals;
  rows: PreviewRow[];
  missingContracts: { contractNumber: string; rowsCount: number; periodStart: string; periodEnd: string }[];
  missingSimCards: { phone: string; contractNumber: string; tariffName: string }[];
  missingTariffs: { operatorId: string; operatorName: string; contractNumber: string; tariffName: string }[];
};

export type ApplyResult = {
  ok: boolean;
  status: string;
  missingContracts?: string[];
  companyConflicts?: CompanyConflict<string>[];
};

async function loadImportBytes(
  ctx: { storage: ActionCtx["storage"] },
  fileId: Id<"_storage">,
): Promise<Uint8Array> {
  const file = await ctx.storage.get(fileId);
  if (!file) throw new Error("Файл не найден");
  return new Uint8Array(await file.arrayBuffer());
}

function decodeTextBytes(data: Uint8Array): string {
  for (const label of ["windows-1251", "utf-8"]) {
    try {
      const text = new TextDecoder(label, { fatal: false }).decode(data);
      if (text.trim()) return text;
    } catch {
      continue;
    }
  }
  return "";
}

/**
 * PDF detail parsing runs on client-extracted text: the in-action pdfjs worker
 * path is unreliable, so .pdf bytes are never parsed here. Callers must send
 * text extracted in the browser via previewDetailText.
 */
export async function parseImportRows(
  fileName: string,
  data: Uint8Array,
  clientText?: string,
): Promise<ImportRow[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    if (clientText !== undefined) {
      return parseMegafonDetailTextRows(clientText, { contractNumber: "", periodStart: "", periodEnd: "" });
    }
    throw new Error(
      "PDF_DETAIL_REQUIRES_TEXT: извлеките текст PDF на клиенте и вызовите previewDetailText",
    );
  }
  if (lower.endsWith(".txt")) {
    const text = clientText ?? decodeTextBytes(data);
    return parseMegafonDetailTextRows(text, { contractNumber: "", periodStart: "", periodEnd: "" });
  }
  if (lower.endsWith(".csv")) {
    const copy = data.slice().buffer as ArrayBuffer;
    const csvRows = parseMegafonCsvRows(copy);
    if (csvRows.length) return csvRows;
  }
  return parseRows(data.slice().buffer as ArrayBuffer);
}

export async function buildPreview(
  ctx: ActionCtx,
  importId: Id<"billingImports">,
  fileName: string,
  contentSha256: string,
  parsedRows: ImportRow[],
): Promise<PreviewResponse> {
  const { rows, vatMismatches, distributedGroups } = applyVatDistribution(parsedRows);

  const context: ImportContextResult = await ctx.runQuery(api.billingImports.getContext, {});

  const contractByNumber = new Map(context.contracts.filter(c => context.contracts.filter(other => other.number === c.number).length === 1).map((c) => [c.number, c]));
  const operatorById = new Map(context.operators.map((o) => [`${o._id}`, o]));
  const tariffByKey = new Map(
    context.tariffs.map((t) => [`${t.operatorId}:${t.name.toLowerCase().trim()}`, t]),
  );
  const simByPhone = new Map<string, (typeof context.simCards)[number]>();
  for (const s of context.simCards) {
    for (const variant of phoneVariants(s.number)) {
      if (!simByPhone.has(variant)) simByPhone.set(variant, s);
    }
  }

  const missingContracts = new Map<string, { rowsCount: number; periodStart?: string; periodEnd?: string }>();
  const missingSimCards = new Map<string, { contractNumber: string; tariffName: string }>();
  const missingTariffs = new Map<
    string,
    { operatorId: string; operatorName: string; contractNumber: string; tariffName: string }
  >();
  let totalAmount = 0;
  let totalVat = 0;
  let totalTotal = 0;

  const previewRows: PreviewRow[] = rows.map((row) => {
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
      const hasSim = variants.some((variant) => {
        const sim = simByPhone.get(variant);
        return (
          sim !== undefined &&
          `${sim.companyId}` === `${contract.companyId}` &&
          `${sim.operatorId}` === `${contract.operatorId}`
        );
      });
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

      const operator = operatorById.get(`${contract.operatorId}`);
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
      tariffFee: row.tariffFee,
      vatMismatch: row.vatMismatch,
      isVatOnly: row.isVatOnly,
      issues,
    };
  });

  const response: PreviewResponse = {
    importId,
    fileName,
    contentSha256,
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

  await ctx.runMutation(api.billingImports.updatePreviewSummary, {
    id: importId,
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
}

export const preview = action({
  args: { id: v.id("billingImports") },
  handler: async (ctx: ActionCtx, { id }: { id: Id<"billingImports"> }): Promise<PreviewResponse> => {
    await requireAuthIfEnabled(ctx);
    const record: Doc<"billingImports"> | null = await ctx.runQuery(api.billingImports.get, { id });
    if (!record) throw new Error("Импорт не найден");
    if (record.status === "applied" && !record.voided) {
      throw new Error("Импорт уже применён: повторный preview запрещён");
    }

    const bytes = await loadImportBytes(ctx, record.fileId);
    const { sha256 } = contentIdentity(bytes);
    await ctx.runMutation(internal.billingImports.setContentHash, {
      id,
      sha256,
      sourceKind: record.fileName.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
    });
    const parsedRows = await parseImportRows(record.fileName, bytes);
    return await buildPreview(ctx, id, record.fileName, sha256, parsedRows);
  },
});

/** Client-extracted PDF/detail text, parsed and previewed end-to-end on the server. */
export const previewDetailText = action({
  args: {
    id: v.id("billingImports"),
    text: v.string(),
    contractNumber: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      id: Id<"billingImports">;
      text: string;
      contractNumber?: string;
      periodStart?: string;
      periodEnd?: string;
    },
  ): Promise<PreviewResponse> => {
    await requireAuthIfEnabled(ctx);
    if (!args.text.trim()) throw new Error("Пустой текст детализации");
    const record: Doc<"billingImports"> | null = await ctx.runQuery(api.billingImports.get, { id: args.id });
    if (!record) throw new Error("Импорт не найден");
    if (record.status === "applied" && !record.voided) {
      throw new Error("Импорт уже применён: повторный preview запрещён");
    }
    const bytes = await loadImportBytes(ctx, record.fileId);
    const { sha256 } = contentIdentity(bytes);
    await ctx.runMutation(internal.billingImports.setContentHash, {
      id: args.id,
      sha256,
      sourceKind: "detail-text",
    });
    const parsedRows = parseMegafonDetailTextRows(args.text, {
      contractNumber: args.contractNumber ?? "",
      periodStart: args.periodStart ?? "",
      periodEnd: args.periodEnd ?? "",
    });
    return await buildPreview(ctx, args.id, record.fileName, sha256, parsedRows);
  },
});

export const apply = action({
  args: {
    id: v.id("billingImports"),
    rows: v.optional(
      v.array(
        v.object({
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
          vatMismatch: v.boolean(),
          isVatOnly: v.boolean(),
        }),
      ),
    ),
    contractResolutions: v.array(
      v.object({
        contractNumber: v.string(),
        company: v.union(
          v.object({ mode: v.literal("existing"), id: v.id("companies") }),
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
          v.object({ mode: v.literal("existing"), id: v.id("operators") }),
          v.object({
            mode: v.literal("create"),
            name: v.string(),
            type: v.optional(v.string()),
            manager: v.optional(v.string()),
            phone: v.optional(v.string()),
            email: v.optional(v.string()),
          }),
        ),
        name: v.optional(v.string()),
        type: v.string(),
        status: v.union(v.literal("active"), v.literal("closing")),
        startDate: v.string(),
        endDate: v.string(),
        monthlyFee: v.number(),
        simCount: v.number(),
      }),
    ),
    simCardActions: v.optional(
      v.array(v.object({ phone: v.string(), action: v.union(v.literal("create"), v.literal("skip")) })),
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
  handler: async (
    ctx: ActionCtx,
    args: {
      id: Id<"billingImports">;
      rows?: ImportRow[];
      contractResolutions: {
        contractNumber: string;
        company: { mode: "existing"; id: Id<"companies"> } | { mode: "create"; name: string; inn?: string; kpp?: string; comment?: string; forceCreate?: boolean };
        operator: { mode: "existing"; id: Id<"operators"> } | { mode: "create"; name: string; type?: string; manager?: string; phone?: string; email?: string };
        name?: string;
        type: string;
        status: "active" | "closing";
        startDate: string;
        endDate: string;
        monthlyFee: number;
        simCount: number;
      }[];
      simCardActions?: { phone: string; action: "create" | "skip" }[];
      tariffOverrides?: { operatorId: Id<"operators">; tariffName: string; monthlyFee?: number }[];
    },
  ): Promise<ApplyResult> => {
    await requireAuthIfEnabled(ctx);
    const record: Doc<"billingImports"> | null = await ctx.runQuery(api.billingImports.get, { id: args.id });
    if (!record) throw new Error("Импорт не найден");
    if (record.status === "applied" && !record.voided) {
      throw new Error("Импорт уже применён: повторное применение запрещено");
    }
    const parsedRows =
      args.rows ?? (await parseImportRows(record.fileName, await loadImportBytes(ctx, record.fileId)));
    const { rows, distributedGroups } = applyVatDistribution(parsedRows);
    const vatDistributionKeys = [...distributedGroups.values()];
    const result: ApplyParsedResult = await ctx.runMutation(api.billingImports.applyParsed, {
      id: args.id,
      rows,
      contractResolutions: args.contractResolutions,
      simCardActions: args.simCardActions,
      tariffOverrides: args.tariffOverrides,
      vatDistributionKeys,
    });
    return result as ApplyResult;
  },
});
