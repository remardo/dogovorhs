import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const expenses = await db.query("expenses").order("desc").collect();
  const companies = await db.query("companies").collect();
  const companyById = new Map(companies.map((c) => [c._id, c.name]));

  const items = expenses
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((e) => {
      const amount = e.amount;
      const vat = e.vat ?? 0;
      const total = e.total ?? amount + vat;
      return {
        id: `${e._id}`,
        companyId: e.companyId,
        company: companyById.get(e.companyId) ?? "Компания",
        contract: e.contract ?? "",
        operator: e.operator ?? "",
        month: e.month,
        type: e.type,
        amount,
        vat,
        total,
        status: e.status ?? "draft",
        hasDocument: e.hasDocument ?? false,
      };
    });

  const summary = items.reduce(
    (acc, item) => {
      acc.total += item.total;
      if (item.status === "confirmed") {
        acc.confirmed += item.total;
      }
      if (item.status === "draft") {
        acc.draft += item.total;
      }
      if (!item.hasDocument) {
        acc.noDocs += 1;
      }
      return acc;
    },
    { total: 0, confirmed: 0, draft: 0, noDocs: 0 },
  );

  return { items, companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })), summary };
});

export const create = mutation({
  args: {
    companyId: v.id("companies"),
    contract: v.optional(v.string()),
    operator: v.optional(v.string()),
    month: v.string(),
    type: v.string(),
    amount: v.number(),
    vat: v.optional(v.number()),
    total: v.optional(v.number()),
    status: v.union(v.literal("confirmed"), v.literal("draft"), v.literal("adjusted")),
    hasDocument: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const company = await db.get(args.companyId);
    if (!company) {
      throw new Error("Компания не найдена");
    }
    const createdAt = Date.now();
    await db.insert("expenses", { ...args, createdAt });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    await db.delete(id);
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("expenses"),
    companyId: v.id("companies"),
    contract: v.optional(v.string()),
    operator: v.optional(v.string()),
    month: v.string(),
    type: v.string(),
    amount: v.number(),
    vat: v.optional(v.number()),
    total: v.optional(v.number()),
    status: v.union(v.literal("confirmed"), v.literal("draft"), v.literal("adjusted")),
    hasDocument: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const company = await db.get(rest.companyId);
    if (!company) {
      throw new Error("Компания не найдена");
    }
    await db.patch(id, rest);
    return { ok: true };
  },
});
