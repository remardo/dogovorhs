"use node";

import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { api, internal } from "./_generated/api";
import {
  detectOperator,
  fixMojibake,
  monthLabelFromPeriod,
  normalizeContractNumber,
  parseInvoiceText,
} from "./_lib/invoiceParser";
import { parseMegafonDetailTextRows } from "./_lib/billingImportDetailText";
import { contentIdentity } from "./_lib/contentHash";
import type { ContractListResult } from "./contracts";
import type { CompanyListResult } from "./companies";
import type { ExpenseListResult } from "./expenses";
import type { ApplyInvoiceResult } from "./invoices";

export type InvoicePreviewResult = {
  parsed: ReturnType<typeof parseInvoiceText> & { month: string };
  suggested: {
    operator: string;
    serviceType?: string;
    contractId?: string;
    contractNumber: string;
    companyId?: string;
  };
  candidates: { id: string; number: string; companyId: string; operatorId: string }[];
  ambiguous: boolean;
  existingExpense?: { id: string; total: number };
  ambiguousExpenseCount: number;
};

export type DetailTextPreviewResult = {
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
  }[];
  total: number;
};

// Текст из PDF извлекается на клиенте (в браузере через pdfjs):
// сервер принимает готовый текст, in-action pdfjs worker ненадёжен.
export const previewText = action({
  args: { fileId: v.id("_storage"), fileName: v.string(), text: v.string() },
  handler: async (
    ctx: ActionCtx,
    { fileId, fileName, text }: { fileId: Id<"_storage">; fileName: string; text: string },
  ): Promise<InvoicePreviewResult> => {
    await requireAuthIfEnabled(ctx);
    const stored = await ctx.storage.get(fileId);
    if (!stored) throw new Error("Файл не найден");
    const parsed = parseInvoiceText(text);

    const contracts: ContractListResult = await ctx.runQuery(api.contracts.list, {});
    const operator = detectOperator(fixMojibake(text).slice(0,6000)) || detectOperator(fileName);
    const want = normalizeContractNumber(parsed.contractNumber);
    let candidates = parsed.contractNumber
      ? contracts.items.filter(
          (c) =>
            c.number === parsed.contractNumber || normalizeContractNumber(c.number) === want,
        )
      : [];
    if (operator) {
      candidates = candidates.filter((c) => (detectOperator(c.operator)||c.operator) === operator);
    }

    let companyId: string | undefined;
    if (parsed.subscriberInn) {
      const companies: CompanyListResult = await ctx.runQuery(api.companies.list, {});
      const byInn = companies.find((c) => c.inn === parsed.subscriberInn);
      if (byInn) {
        companyId = byInn.id;
        candidates = candidates.filter((c) => `${c.companyId}` === companyId);
      }
    }
    const contract = candidates.length === 1 ? candidates[0] : undefined;
    if (contract) {
      companyId = `${contract.companyId}`;
    }

    let existingExpense: { id: string; total: number } | undefined;
    let ambiguousExpenseCount = 0;
    if (companyId) {
      const month = monthLabelFromPeriod(parsed.periodEnd || parsed.periodStart);
      const expenses: ExpenseListResult = await ctx.runQuery(api.expenses.list, {});
      const same = expenses.items.filter(
        (e) =>
          `${e.companyId}` === companyId &&
          e.month === month &&
          e.contract === parsed.contractNumber &&
          e.kind === "charge" &&
          !e.voided &&
          e.status !== "cancelled",
      );
      ambiguousExpenseCount = same.length;
      if (same.length === 1) existingExpense = { id: same[0].id, total: same[0].total };
    }

    return {
      parsed: { ...parsed, month: monthLabelFromPeriod(parsed.periodEnd || parsed.periodStart) },
      suggested: {
        operator:contract?.operator ?? operator,
        serviceType:contract?.serviceCategory ?? contract?.type,
        contractId: contract ? contract.id : undefined,
        contractNumber: contract?.number ?? parsed.contractNumber,
        companyId,
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        number: c.number,
        companyId: `${c.companyId}`,
        operatorId: `${c.operatorId}`,
      })),
      ambiguous: candidates.length > 1,
      existingExpense,
      ambiguousExpenseCount,
    };
  },
});

/** Client-extracted detail text path for unreliable in-action PDF parsing. */
export const previewDetailText = action({
  args: {
    text: v.string(),
    contractNumber: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: { text: string; contractNumber?: string; periodStart?: string; periodEnd?: string },
  ): Promise<DetailTextPreviewResult> => {
    await requireAuthIfEnabled(ctx);
    const rows = parseMegafonDetailTextRows(args.text, {
      contractNumber: args.contractNumber ?? "",
      periodStart: args.periodStart ?? "",
      periodEnd: args.periodEnd ?? "",
    });
    return {
      rows: rows.map((r) => ({
        rowIndex: r.rowIndex,
        phone: r.phone,
        contractNumber: r.contractNumber,
        tariffName: r.tariffName,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        month: r.month,
        amount: r.amount,
        vat: r.vat,
        total: r.total,
      })),
      total: rows.reduce((acc, r) => acc + r.total, 0),
    };
  },
});

export const apply = action({
  args: {
    fileId: v.id("_storage"),
    fileName: v.string(),
    operator: v.string(),
    kind: v.union(v.literal("invoice"), v.literal("detail")),
    invoiceNo: v.string(),
    invoiceDate: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    month: v.string(),
    contractNumber: v.string(),
    contractId: v.optional(v.id("contracts")),
    companyId: v.optional(v.id("companies")),
    operatorId: v.optional(v.id("operators")),
    amount: v.number(),
    vat: v.number(),
    total: v.number(),
    note: v.optional(v.string()),
    serviceType: v.optional(v.string()),
    vatRate: v.optional(v.number()),
    serviceTotal: v.optional(v.number()),
    vatBasis: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args: {
      fileId: Id<"_storage">;
      fileName: string;
      operator: string;
      kind: "invoice" | "detail";
      invoiceNo: string;
      invoiceDate: string;
      periodStart: string;
      periodEnd: string;
      month: string;
      contractNumber: string;
      contractId?: Id<"contracts">;
      companyId?: Id<"companies">;
      operatorId?: Id<"operators">;
      amount: number;
      vat: number;
      total: number;
      note?: string;
      serviceType?: string;
      vatRate?: number;
      serviceTotal?: number;
      vatBasis?: string;
    },
  ): Promise<{ invoiceId: string; status: string }> => {
    await requireAuthIfEnabled(ctx);
    const stored = await ctx.storage.get(args.fileId);
    if (!stored) throw new Error("Файл не найден");
    // Server-calculated content identity from storage bytes (never client hash).
    const { sha256 } = contentIdentity(new Uint8Array(await stored.arrayBuffer()));
    const result: ApplyInvoiceResult = await ctx.runMutation(internal.invoices.applyWithContent, {
      fileId: args.fileId,
      fileName: args.fileName,
      operator: args.operator,
      kind: args.kind,
      invoiceNo: args.invoiceNo,
      invoiceDate: args.invoiceDate,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      month: args.month,
      contractNumber: args.contractNumber,
      ...(args.contractId ? { contractId: args.contractId } : {}),
      ...(args.companyId ? { companyId: args.companyId } : {}),
      ...(args.operatorId ? { operatorId: args.operatorId } : {}),
      amount: args.amount,
      vat: args.vat,
      total: args.total,
      ...(args.note ? { note: args.note } : {}),
      ...(args.serviceType ? { serviceType: args.serviceType } : {}),
      ...(args.vatRate !== undefined ? { vatRate: args.vatRate } : {}),
      ...(args.serviceTotal !== undefined ? { serviceTotal: args.serviceTotal } : {}),
      ...(args.vatBasis ? { vatBasis: args.vatBasis } : {}),
      contentSha256: sha256,
    });
    return { invoiceId: result.invoiceId, status: result.status };
  },
});
