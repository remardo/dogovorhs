import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const [operators, contracts, simCards] = await Promise.all([
    db.query("operators").collect(),
    db.query("contracts").collect(),
    db.query("simCards").collect(),
  ]);

  const contractsByOperator = new Map<string, number>();
  for (const contract of contracts) {
    contractsByOperator.set(`${contract.operatorId}`, (contractsByOperator.get(`${contract.operatorId}`) ?? 0) + 1);
  }

  const simCardsByOperator = new Map<string, number>();
  for (const sim of simCards) {
    simCardsByOperator.set(`${sim.operatorId}`, (simCardsByOperator.get(`${sim.operatorId}`) ?? 0) + 1);
  }

  return operators
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => ({
      id: `${o._id}`,
      name: o.name,
      type: o.type ?? "Мобильная связь",
      manager: o.manager ?? "-",
      phone: o.phone ?? "",
      email: o.email ?? "",
      contracts: contractsByOperator.get(`${o._id}`) ?? 0,
      simCards: simCardsByOperator.get(`${o._id}`) ?? 0,
    }));
});

export const create = mutation({
  args: {
    name: v.string(),
    type: v.optional(v.string()),
    manager: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const existing = await db
      .query("operators")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      throw new Error("Оператор с таким названием уже существует");
    }
    const createdAt = Date.now();
    await db.insert("operators", { ...args, contracts: 0, simCards: 0, createdAt });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("operators") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [hasContracts, hasSimCards, hasTariffs] = await Promise.all([
      db
        .query("contracts")
        .withIndex("by_operator", (q) => q.eq("operatorId", id))
        .take(1),
      db
        .query("simCards")
        .withIndex("by_operator", (q) => q.eq("operatorId", id))
        .take(1),
      db
        .query("tariffs")
        .withIndex("by_operator", (q) => q.eq("operatorId", id))
        .take(1),
    ]);

    if (hasContracts.length || hasSimCards.length || hasTariffs.length) {
      throw new Error("Нельзя удалить оператора: есть связанные записи (договоры/SIM/тарифы)");
    }
    await db.delete(id);
    return { ok: true };
  },
});
