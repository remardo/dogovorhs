import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const sims = await db.query("simCards").order("desc").collect();
  const companies = await db.query("companies").collect();
  const operators = await db.query("operators").collect();
  const employees = await db.query("employees").collect();
  const tariffs = await db.query("tariffs").collect();

  const companyById = new Map(companies.map((c) => [c._id, c.name]));
  const operatorById = new Map(operators.map((o) => [o._id, o.name]));
  const employeeById = new Map(employees.map((e) => [e._id, e.name]));
  const tariffById = new Map(tariffs.map((t) => [t._id, t.name]));

  const items = sims
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((sim) => ({
      id: `${sim._id}`,
      number: sim.number,
      iccid: sim.iccid ?? "",
      type: sim.type ?? "Голосовая",
      status: sim.status,
      operatorId: sim.operatorId,
      operator: operatorById.get(sim.operatorId) ?? "Оператор",
      companyId: sim.companyId,
      company: companyById.get(sim.companyId) ?? "Компания",
      employeeId: sim.employeeId ? `${sim.employeeId}` : undefined,
      employee: sim.employeeId ? employeeById.get(sim.employeeId) ?? "" : "",
      tariffId: sim.tariffId ? `${sim.tariffId}` : undefined,
      tariff: sim.tariffId ? tariffById.get(sim.tariffId) ?? "" : "",
      limit: sim.limit ?? 0,
    }));

  return {
    items,
    companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
    operators: operators.map((o) => ({ id: `${o._id}`, name: o.name })),
    employees: employees.map((e) => ({ id: `${e._id}`, name: e.name })),
    tariffs: tariffs.map((t) => ({ id: `${t._id}`, name: t.name })),
  };
});

export const create = mutation({
  args: {
    number: v.string(),
    iccid: v.optional(v.string()),
    type: v.optional(v.string()),
    companyId: v.id("companies"),
    operatorId: v.id("operators"),
    employeeId: v.optional(v.id("employees")),
    tariffId: v.optional(v.id("tariffs")),
    status: v.union(v.literal("active"), v.literal("blocked")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [company, operator] = await Promise.all([db.get(args.companyId), db.get(args.operatorId)]);
    if (!company) throw new Error("Компания не найдена");
    if (!operator) throw new Error("Оператор не найден");
    if (args.employeeId) {
      const employee = await db.get(args.employeeId);
      if (!employee) throw new Error("Сотрудник не найден");
    }
    if (args.tariffId) {
      const tariff = await db.get(args.tariffId);
      if (!tariff) throw new Error("Тариф не найден");
    }

    const existingNumber = await db
      .query("simCards")
      .filter((q) => q.eq(q.field("number"), args.number))
      .first();
    if (existingNumber) {
      throw new Error("SIM-карта с таким номером уже существует");
    }

    if (args.iccid) {
      const existingIccid = await db
        .query("simCards")
        .filter((q) => q.eq(q.field("iccid"), args.iccid))
        .first();
      if (existingIccid) {
        throw new Error("SIM-карта с таким ICCID уже существует");
      }
    }
    const createdAt = Date.now();
    await db.insert("simCards", { ...args, createdAt });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("simCards") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    await db.delete(id);
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("simCards"),
    number: v.string(),
    iccid: v.optional(v.string()),
    type: v.optional(v.string()),
    companyId: v.id("companies"),
    operatorId: v.id("operators"),
    employeeId: v.optional(v.id("employees")),
    tariffId: v.optional(v.id("tariffs")),
    status: v.union(v.literal("active"), v.literal("blocked")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const [company, operator] = await Promise.all([db.get(rest.companyId), db.get(rest.operatorId)]);
    if (!company) throw new Error("Компания не найдена");
    if (!operator) throw new Error("Оператор не найден");
    if (rest.employeeId) {
      const employee = await db.get(rest.employeeId);
      if (!employee) throw new Error("Сотрудник не найден");
    }
    if (rest.tariffId) {
      const tariff = await db.get(rest.tariffId);
      if (!tariff) throw new Error("Тариф не найден");
    }

    const dupNumber = await db
      .query("simCards")
      .filter((q) => q.and(q.eq(q.field("number"), rest.number), q.neq(q.field("_id"), id)))
      .first();
    if (dupNumber) {
      throw new Error("SIM-карта с таким номером уже существует");
    }

    if (rest.iccid) {
      const dupIccid = await db
        .query("simCards")
        .filter((q) => q.and(q.eq(q.field("iccid"), rest.iccid), q.neq(q.field("_id"), id)))
        .first();
      if (dupIccid) {
        throw new Error("SIM-карта с таким ICCID уже существует");
      }
    }
    await db.patch(id, rest);
    return { ok: true };
  },
});
