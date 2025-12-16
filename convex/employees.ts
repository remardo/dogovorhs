import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthIfEnabled } from "./_lib/auth";

export const list = query(async (ctx) => {
  await requireAuthIfEnabled(ctx);
  const { db } = ctx;
  const employees = await db.query("employees").collect();
  const companies = await db.query("companies").collect();

  const companyById = new Map(companies.map((c) => [c._id, c.name]));

  return employees
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((employee) => ({
      id: `${employee._id}`,
      name: employee.name,
      companyId: employee.companyId,
      company: companyById.get(employee.companyId) ?? "Компания",
      department: employee.department,
      position: employee.position,
      status: employee.status,
      simCount: employee.simCount,
      maxSim: employee.maxSim,
    }));
});

export const create = mutation({
  args: {
    name: v.string(),
    companyId: v.id("companies"),
    department: v.string(),
    position: v.string(),
    status: v.union(v.literal("active"), v.literal("fired")),
    simCount: v.number(),
    maxSim: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const company = await db.get(args.companyId);
    if (!company) {
      throw new Error("Компания не найдена");
    }
    const createdAt = Date.now();
    await db.insert("employees", { ...args, createdAt });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("employees") },
  handler: async (ctx, { id }) => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const used = await db
      .query("simCards")
      .withIndex("by_employee", (q) => q.eq("employeeId", id))
      .take(1);
    if (used.length) {
      throw new Error("Нельзя удалить сотрудника: к нему привязаны SIM-карты");
    }
    await db.delete(id);
    return { ok: true };
  },
});

export const update = mutation({
  args: {
    id: v.id("employees"),
    name: v.string(),
    companyId: v.id("companies"),
    department: v.string(),
    position: v.string(),
    status: v.union(v.literal("active"), v.literal("fired")),
    simCount: v.number(),
    maxSim: v.number(),
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
