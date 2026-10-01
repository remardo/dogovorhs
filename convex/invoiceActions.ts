"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  detectOperator,
  monthLabelFromPeriod,
  normalizeContractNumber,
  parseInvoiceText,
} from "./_lib/invoiceParser";

// Текст из PDF извлекается на клиенте (в браузере/Node через pdfjs с воркером):
// в Convex-изоляте worker-файл не попадает в бандл, поэтому сервер принимает готовый текст.
export const previewText = action({
  args: { fileId: v.id("_storage"), fileName: v.string(), text: v.string() },
  handler: async (ctx, { fileId, fileName, text }) => {
    await requireAuthIfEnabled(ctx);
    const stored = await ctx.storage.get(fileId);
    if (!stored) throw new Error("Файл не найден");
    const parsed = parseInvoiceText(text);

    // NB: результаты runQuery кастуем к явным типам (как в billingImportActions),
    // иначе вывод типов api зацикливается (api -> invoiceActions -> api).
    const contracts = (await ctx.runQuery(api.contracts.list, {})) as {
      items: { id: string; number: string; companyId: string }[];
    };
    const want = normalizeContractNumber(parsed.contractNumber);
    const contract = parsed.contractNumber
      ? (contracts.items.find((c) => c.number === parsed.contractNumber) ??
        contracts.items.find((c) => normalizeContractNumber(c.number) === want))
      : undefined;

    let companyId: string | undefined;
    if (contract) {
      companyId = `${contract.companyId}`;
    } else if (parsed.subscriberInn) {
      const companies = (await ctx.runQuery(api.companies.list, {})) as {
        id: string;
        inn: string;
      }[];
      const byInn = companies.find((c) => c.inn === parsed.subscriberInn);
      if (byInn) companyId = byInn.id;
    }

    let existingExpense: { id: string; total: number } | undefined;
    if (companyId) {
      const month = monthLabelFromPeriod(parsed.periodEnd || parsed.periodStart);
      const expenses = (await ctx.runQuery(api.expenses.list, {})) as {
        items: { id: string; companyId: string; month: string; contract: string; total: number }[];
      };
      const same = expenses.items.find(
        (e) => `${e.companyId}` === companyId && e.month === month && e.contract === parsed.contractNumber,
      );
      if (same) existingExpense = { id: same.id, total: same.total };
    }

    return {
      parsed: {
        ...parsed,
        month: monthLabelFromPeriod(parsed.periodEnd || parsed.periodStart),
      },
      suggested: {
        operator: detectOperator(`${fileName}\n${parsed.subscriber}`),
        contractId: contract ? contract.id : undefined,
        contractNumber: contract?.number ?? parsed.contractNumber,
        companyId,
      },
      existingExpense,
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
    amount: v.number(),
    vat: v.number(),
    total: v.number(),
    note: v.optional(v.string()),
    serviceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const stored = await ctx.storage.get(args.fileId);
    if (!stored) throw new Error("Файл не найден");
    const { fileId, fileName, serviceType, ...rest } = args;
    const invoiceId: Id<"invoices"> = await ctx.runMutation(api.invoices.create, {
      ...rest,
      fileId,
      fileName,
      createdAt: Date.now(),
    });
    if (args.contractId && args.kind === "invoice") {
      await ctx.runMutation(api.invoices.update, {
        id: invoiceId,
        contractId: args.contractId,
        ...(args.companyId ? { companyId: args.companyId } : {}),
        status: "matched",
      });
      // invoices:update создаёт расход с типом по умолчанию; при необходимости правим тип.
      if (serviceType && serviceType !== "Мобильная связь") {
        const inv = await ctx.runQuery(api.invoices.get, { id: invoiceId });
        if (inv?.expenseId && inv.companyId) {
          await ctx.runMutation(api.expenses.update, {
            id: inv.expenseId,
            companyId: inv.companyId,
            contract: inv.contractNumber,
            operator: inv.operator,
            month: inv.month,
            type: serviceType,
            amount: inv.amount,
            vat: inv.vat,
            total: inv.total,
            status: "confirmed",
            hasDocument: true,
          });
        }
      }
    }
    return { invoiceId };
  },
});
