import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const tariffs = await db.query("tariffs").order("desc").collect();
  const operators = await db.query("operators").collect();
  const simCards = await db.query("simCards").collect();
  const operatorById = new Map(operators.map((o) => [o._id, o.name]));

  const simCardsByTariff = new Map<string, number>();
  for (const sim of simCards) {
    if (!sim.tariffId) continue;
    const key = `${sim.tariffId}`;
    simCardsByTariff.set(key, (simCardsByTariff.get(key) ?? 0) + 1);
  }

  const items = tariffs
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => ({
      id: `${t._id}`,
      name: t.name,
      operatorId: t.operatorId,
      operator: operatorById.get(t.operatorId) ?? "Оператор",
      type: t.dataLimitGb ? "Мобильный интернет" : "Мобильная связь",
      monthlyFee: t.monthlyFee,
      dataLimitGb: t.dataLimitGb ?? null,
      minutes: t.minutes ?? null,
      sms: t.sms ?? null,
      status: t.status ?? "active",
      simCount: simCardsByTariff.get(`${t._id}`) ?? 0,
    }));

  return {
    items,
    operators: operators.map((o) => ({ id: `${o._id}`, name: o.name })),
  };
});

export const create = mutation({
  args: {
    name: v.string(),
    operatorId: v.id("operators"),
    monthlyFee: v.number(),
    dataLimitGb: v.optional(v.number()),
    minutes: v.optional(v.number()),
    sms: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("archive")),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const operator = await db.get(args.operatorId);
    if (!operator) {
      throw new Error("Оператор не найден");
    }
    const createdAt = Date.now();
    await db.insert("tariffs", { ...args, simCount: 0, createdAt });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("tariffs") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const used = await db
      .query("simCards")
      .withIndex("by_tariff", (q) => q.eq("tariffId", id))
      .take(1);
    if (used.length) {
      throw new Error("Нельзя удалить тариф: он используется в SIM-картах");
    }
    await db.delete(id);
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("tariffs"),
    name: v.string(),
    operatorId: v.id("operators"),
    monthlyFee: v.number(),
    dataLimitGb: v.optional(v.number()),
    minutes: v.optional(v.number()),
    sms: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("archive")),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const operator = await db.get(rest.operatorId);
    if (!operator) {
      throw new Error("Оператор не найден");
    }
    await db.patch(id, rest);
    return { ok: true };
  },
});
