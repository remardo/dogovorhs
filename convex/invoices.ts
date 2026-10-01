import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const [invoices, contracts, companies] = await Promise.all([
    db.query("invoices").collect(),
    db.query("contracts").collect(),
    db.query("companies").collect(),
  ]);
  const contractById = new Map(contracts.map((c) => [`${c._id}`, c]));
  const companyById = new Map(companies.map((c) => [`${c._id}`, c]));

  const items = await Promise.all(
    invoices
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(async (inv) => {
        const contract = inv.contractId ? contractById.get(`${inv.contractId}`) : undefined;
        const company = inv.companyId ? companyById.get(`${inv.companyId}`) : undefined;
        const fileUrl = await ctx.storage.getUrl(inv.fileId);
        return {
          id: `${inv._id}`,
          fileName: inv.fileName,
          fileUrl,
          operator: inv.operator,
          kind: inv.kind,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          month: inv.month,
          contractNumber: inv.contractNumber,
          contractId: inv.contractId ? `${inv.contractId}` : undefined,
          contract: contract?.number ?? "",
          companyId: inv.companyId ? `${inv.companyId}` : undefined,
          company: company?.name ?? "",
          amount: inv.amount,
          vat: inv.vat,
          total: inv.total,
          status: inv.status,
          expenseId: inv.expenseId ? `${inv.expenseId}` : undefined,
          note: inv.note ?? "",
          createdAt: inv.createdAt,
        };
      }),
  );

  const summary = items.reduce(
    (acc, item) => {
      if (item.kind !== "invoice") return acc;
      acc.total += item.total;
      if (item.status === "matched") acc.matched += 1;
      else acc.draft += 1;
      return acc;
    },
    { total: 0, matched: 0, draft: 0 },
  );

  return {
    items,
    companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
    contracts: contracts.map((c) => ({ id: `${c._id}`, name: c.number })),
    summary,
  };
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    return await ctx.db.get(id);
  },
});

export const create = mutation({
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
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    if (args.contractId) {
      const contract = await db.get(args.contractId);
      if (!contract) throw new Error("Договор не найден");
    }
    return await db.insert("invoices", {
      ...args,
      status: args.contractId ? "matched" : "draft",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("invoices"),
    contractId: v.optional(v.id("contracts")),
    contractNumber: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    status: v.optional(v.union(v.literal("draft"), v.literal("matched"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const invoice = await db.get(id);
    if (!invoice) throw new Error("Счёт не найден");
    let { companyId, status } = rest;
    if (rest.contractId) {
      const contract = await db.get(rest.contractId);
      if (!contract) throw new Error("Договор не найден");
      companyId = companyId ?? contract.companyId;
      status = status ?? "matched";
    }
    await db.patch(id, {
      ...(rest.contractId ? { contractId: rest.contractId } : {}),
      ...(rest.contractNumber !== undefined ? { contractNumber: rest.contractNumber } : {}),
      ...(companyId ? { companyId } : {}),
      ...(status ? { status } : {}),
      ...(rest.note !== undefined ? { note: rest.note } : {}),
    });
    // Если счёт привязали к договору без расхода — создать расход.
    const updated = await db.get(id);
    if (updated && updated.contractId && updated.companyId && !updated.expenseId && updated.kind === "invoice") {
      const existing = await db
        .query("expenses")
        .withIndex("by_company_month", (q) =>
          q.eq("companyId", updated.companyId!).eq("month", updated.month),
        )
        .collect();
      const same = existing.find((e) => e.contract === updated.contractNumber);
      if (same) {
        await db.patch(id, { expenseId: same._id });
      } else {
        const expenseId = await db.insert("expenses", {
          companyId: updated.companyId,
          contract: updated.contractNumber,
          operator: updated.operator,
          month: updated.month,
          type: "Мобильная связь",
          amount: updated.amount,
          vat: updated.vat,
          total: updated.total,
          status: "confirmed",
          hasDocument: true,
          createdAt: Date.now(),
        });
        await db.patch(id, { expenseId, status: "matched" });
      }
    }
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const invoice = await db.get(id);
    if (!invoice) return { ok: false };
    await ctx.storage.delete(invoice.fileId);
    await db.delete(id);
    return { ok: true };
  },
});
