import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { writeAudit } from "./_lib/audit";

export type OperatorListItem = {
  id: string;
  name: string;
  type: string;
  manager: string;
  phone: string;
  email: string;
  contracts: number;
  simCards: number;
};

export type OperatorListResult = OperatorListItem[];

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<OperatorListResult> => {
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

    return [...operators]
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
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: v.optional(v.string()),
    manager: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { name: string; type?: string; manager?: string; phone?: string; email?: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    if (!args.name.trim()) throw new Error("Название оператора обязательно");
    const existing = await db
      .query("operators")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      throw new Error("Оператор с таким названием уже существует");
    }
    await db.insert("operators", { ...args, name: args.name.trim(), contracts: 0, simCards: 0, createdAt: Date.now() });
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("operators"),
    name: v.string(),
    type: v.optional(v.string()),
    manager: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"operators">; name: string; type?: string; manager?: string; phone?: string; email?: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const existing = await db.get(args.id);
    if (!existing) throw new Error("Оператор не найден");
    if (!args.name.trim()) throw new Error("Название оператора обязательно");
    const duplicate = await db
      .query("operators")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (duplicate && `${duplicate._id}` !== `${args.id}`) {
      throw new Error("Оператор с таким названием уже существует");
    }
    const { id, ...rest } = args;
    await db.patch(id, { ...rest, name: rest.name.trim() });
    await writeAudit(ctx, { entityType: "operator", entityId: `${id}`, action: "updated" });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("operators") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"operators"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [hasContracts, hasSimCards, hasTariffs] = await Promise.all([
      db.query("contracts").withIndex("by_operator", (q) => q.eq("operatorId", id)).take(1),
      db.query("simCards").withIndex("by_operator", (q) => q.eq("operatorId", id)).take(1),
      db.query("tariffs").withIndex("by_operator", (q) => q.eq("operatorId", id)).take(1),
    ]);

    if (hasContracts.length || hasSimCards.length || hasTariffs.length) {
      throw new Error("Нельзя удалить оператора: есть связанные записи (договоры/SIM/тарифы)");
    }
    await db.delete(id);
    return { ok: true };
  },
});
