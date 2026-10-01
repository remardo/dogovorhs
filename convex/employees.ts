import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { writeAudit } from "./_lib/audit";

export type EmployeeListItem = {
  id: string;
  name: string;
  companyId: Id<"companies">;
  company: string;
  department: string;
  position: string;
  status: "active" | "fired";
  simCount: number;
  computedSimCount: number;
  maxSim: number;
};

export type EmployeeHistory = {
  employee: Doc<"employees">;
  assignments: { id: string; simCardId: string; assignedAt: number; unassignedAt?: number }[];
  simCards: { id: string; number: string }[];
  expenses: { id: string; month: string; periodKey?: string; kind: string; total: number }[];
};

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<EmployeeListItem[]> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [employees, companies, simCards] = await Promise.all([
      db.query("employees").collect(),
      db.query("companies").collect(),
      db.query("simCards").collect(),
    ]);

    const companyById = new Map<string, string>(companies.map((c) => [`${c._id}`, c.name]));
    const activeSimByEmployee = new Map<string, number>();
    for (const sim of simCards) {
      if (sim.employeeId) {
        activeSimByEmployee.set(`${sim.employeeId}`, (activeSimByEmployee.get(`${sim.employeeId}`) ?? 0) + 1);
      }
    }

    return [...employees]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((employee) => ({
        id: `${employee._id}`,
        name: employee.name,
        companyId: employee.companyId,
        company: companyById.get(`${employee.companyId}`) ?? "Компания",
        department: employee.department,
        position: employee.position,
        status: employee.status,
        simCount: employee.simCount,
        computedSimCount: activeSimByEmployee.get(`${employee._id}`) ?? 0,
        maxSim: employee.maxSim,
      }));
  },
});

export const getWithHistory = query({
  args: { id: v.id("employees"), periodKey: v.optional(v.string()) },
  handler: async (
    ctx: QueryCtx,
    { id, periodKey }: { id: Id<"employees">; periodKey?: string },
  ): Promise<EmployeeHistory> => {
    await requireAuthIfEnabled(ctx);
    const employee = await ctx.db.get(id);
    if (!employee) throw new Error("Сотрудник не найден");
    const [assignments, expenses, simCards] = await Promise.all([
      ctx.db.query("simAssignments").withIndex("by_employee", (q) => q.eq("employeeId", id)).collect(),
      ctx.db.query("expenses").collect(),
      ctx.db.query("simCards").withIndex("by_employee", (q) => q.eq("employeeId", id)).collect(),
    ]);
    let charges = expenses.filter(
      (e) => !e.voided && e.employeeId && `${e.employeeId}` === `${id}`,
    );
    if (periodKey) {
      charges = charges.filter((e) => (e.periodKey ?? e.month) === periodKey || e.month === periodKey);
    }
    return {
      employee,
      assignments: assignments.map((a) => ({
        id: `${a._id}`,
        simCardId: `${a.simCardId}`,
        assignedAt: a.assignedAt,
        unassignedAt: a.unassignedAt,
      })),
      simCards: simCards.map((s) => ({ id: `${s._id}`, number: s.number })),
      expenses: charges.map((e) => ({
        id: `${e._id}`,
        month: e.month,
        periodKey: e.periodKey,
        kind: e.kind ?? "charge",
        total: e.total ?? e.amount + (e.vat ?? 0),
      })),
    };
  },
});

export type EmployeeWriteInput = {
  name: string;
  companyId: Id<"companies">;
  department: string;
  position: string;
  status: "active" | "fired";
  simCount: number;
  maxSim: number;
};

const employeeWriteValidator = {
  name: v.string(),
  companyId: v.id("companies"),
  department: v.string(),
  position: v.string(),
  status: v.union(v.literal("active"), v.literal("fired")),
  simCount: v.number(),
  maxSim: v.number(),
};

export const create = mutation({
  args: employeeWriteValidator,
  handler: async (ctx: MutationCtx, args: EmployeeWriteInput): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    if (!args.name.trim()) throw new Error("Имя сотрудника обязательно");
    const company = await db.get(args.companyId);
    if (!company) {
      throw new Error("Компания не найдена");
    }
    if (args.maxSim < 0) throw new Error("Лимит SIM не может быть отрицательным");
    const id = await db.insert("employees", { ...args, name: args.name.trim(), createdAt: Date.now() });
    await writeAudit(ctx, { entityType: "employee", entityId: `${id}`, action: "created" });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("employees") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"employees"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [sims, assignments, expenses] = await Promise.all([
      db.query("simCards").withIndex("by_employee", (q) => q.eq("employeeId", id)).take(1),
      db.query("simAssignments").withIndex("by_employee", (q) => q.eq("employeeId", id)).take(1),
      ctx.db.query("expenses").collect(),
    ]);
    if (sims.length || assignments.length) {
      throw new Error("Нельзя удалить сотрудника: к нему привязаны SIM-карты или история назначений");
    }
    const hasCharges = expenses.some(
      (e) => e.employeeId && `${e.employeeId}` === `${id}`,
    );
    if (hasCharges) {
      throw new Error("Нельзя удалить сотрудника с историей начислений");
    }
    await db.delete(id);
    return { ok: true };
  },
});

export const update = mutation({
  args: { ...employeeWriteValidator, id: v.id("employees") },
  handler: async (
    ctx: MutationCtx,
    args: EmployeeWriteInput & { id: Id<"employees"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const prev = await db.get(id);
    if (!prev) throw new Error("Сотрудник не найден");
    const company = await db.get(rest.companyId);
    if (!company) {
      throw new Error("Компания не найдена");
    }
    const assigned = await db.query("simCards").withIndex("by_employee", q => q.eq("employeeId", id)).collect();
    if (rest.status === "fired" && assigned.length) throw new Error("Сначала снимите назначенные номера с сотрудника");
    if (rest.maxSim < assigned.length) throw new Error("Лимит ниже количества назначенных номеров");
    if (rest.maxSim < 0) throw new Error("Лимит SIM не может быть отрицательным");
    if (`${prev.companyId}` !== `${rest.companyId}`) {
      const sims = await db
        .query("simCards")
        .withIndex("by_employee", (q) => q.eq("employeeId", id))
        .take(1);
      if (sims.length) {
        throw new Error("Нельзя перевести сотрудника в другую компанию с назначенными SIM");
      }
    }
    await db.patch(id, rest);
    await writeAudit(ctx, { entityType: "employee", entityId: `${id}`, action: "updated" });
    return { ok: true };
  },
});
