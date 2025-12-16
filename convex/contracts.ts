import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const contracts = await db.query("contracts").collect();
  const companies = await db.query("companies").collect();
  const operators = await db.query("operators").collect();

  const companyById = new Map(companies.map((c) => [c._id, c.name]));
  const operatorById = new Map(operators.map((o) => [o._id, o.name]));

  const items = contracts
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((contract) => ({
      id: `${contract._id}`,
      number: contract.number,
      companyId: contract.companyId,
      company: companyById.get(contract.companyId) ?? "Компания",
      operatorId: contract.operatorId,
      operator: operatorById.get(contract.operatorId) ?? "Оператор",
      type: contract.type,
      status: contract.status,
      startDate: contract.startDate ?? "",
      endDate: contract.endDate ?? "Бессрочный",
      monthlyFee: contract.monthlyFee ?? contract.amount ?? 0,
      simCount: contract.simCount ?? 0,
    }));

  return {
    items,
    companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
    operators: operators.map((o) => ({ id: `${o._id}`, name: o.name })),
  };
});

export const create = mutation({
  args: {
    number: v.string(),
    companyId: v.id("companies"),
    operatorId: v.id("operators"),
    type: v.string(),
    status: v.union(v.literal("active"), v.literal("closing")),
    startDate: v.string(),
    endDate: v.string(),
    monthlyFee: v.number(),
    simCount: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const existing = await db
      .query("contracts")
      .filter((q) => q.eq(q.field("number"), args.number))
      .first();
    if (existing) {
      throw new Error("Договор с таким номером уже существует");
    }
    const [company, operator] = await Promise.all([db.get(args.companyId), db.get(args.operatorId)]);
    if (!company) throw new Error("Компания не найдена");
    if (!operator) throw new Error("Оператор не найден");
    const createdAt = Date.now();
    await db.insert("contracts", { ...args, createdAt });
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("contracts"),
    number: v.string(),
    companyId: v.id("companies"),
    operatorId: v.id("operators"),
    type: v.string(),
    status: v.union(v.literal("active"), v.literal("closing")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    monthlyFee: v.optional(v.number()),
    simCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const [company, operator] = await Promise.all([db.get(rest.companyId), db.get(rest.operatorId)]);
    if (!company) throw new Error("Компания не найдена");
    if (!operator) throw new Error("Оператор не найден");

    const duplicate = await db
      .query("contracts")
      .filter((q) => q.and(q.eq(q.field("number"), rest.number), q.neq(q.field("_id"), id)))
      .first();
    if (duplicate) {
      throw new Error("Договор с таким номером уже существует");
    }
    await db.patch(id, rest);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("contracts") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    await db.delete(id);
    return { ok: true };
  },
});
