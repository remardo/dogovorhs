import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { writeAudit } from "./_lib/audit";

export type AssignmentItem = {
  id: string;
  simCardId: string;
  employeeId?: string;
  contractId?: string;
  assignedAt: number;
  unassignedAt?: number;
  note: string;
  createdAt: number;
};

function toItem(a: {
  _id: Id<"simAssignments">;
  simCardId: Id<"simCards">;
  employeeId?: Id<"employees">;
  contractId?: Id<"contracts">;
  assignedAt: number;
  unassignedAt?: number;
  note?: string;
  createdAt: number;
}): AssignmentItem {
  return {
    id: `${a._id}`,
    simCardId: `${a.simCardId}`,
    employeeId: a.employeeId ? `${a.employeeId}` : undefined,
    contractId: a.contractId ? `${a.contractId}` : undefined,
    assignedAt: a.assignedAt,
    unassignedAt: a.unassignedAt,
    note: a.note ?? "",
    createdAt: a.createdAt,
  };
}

export const historyBySim = query({
  args: { simCardId: v.id("simCards") },
  handler: async (
    ctx: QueryCtx,
    { simCardId }: { simCardId: Id<"simCards"> },
  ): Promise<AssignmentItem[]> => {
    await requireAuthIfEnabled(ctx);
    const all = await ctx.db
      .query("simAssignments")
      .withIndex("by_sim", (q) => q.eq("simCardId", simCardId))
      .collect();
    return [...all].sort((a, b) => b.assignedAt - a.assignedAt).map(toItem);
  },
});

export const historyByEmployee = query({
  args: { employeeId: v.id("employees") },
  handler: async (
    ctx: QueryCtx,
    { employeeId }: { employeeId: Id<"employees"> },
  ): Promise<AssignmentItem[]> => {
    await requireAuthIfEnabled(ctx);
    const all = await ctx.db
      .query("simAssignments")
      .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
      .collect();
    return [...all].sort((a, b) => b.assignedAt - a.assignedAt).map(toItem);
  },
});

export async function assignCore(
  ctx: MutationCtx,
  args: { simCardId: Id<"simCards">; employeeId?: Id<"employees">; contractId?: Id<"contracts">; note?: string },
): Promise<{ ok: boolean; assignmentId?: string }> {
  const sim = await ctx.db.get(args.simCardId);
  if (!sim) throw new Error("SIM-карта не найдена");
  if (args.employeeId) {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Сотрудник не найден");
    if (`${employee.companyId}` !== `${sim.companyId}`) {
      throw new Error("Сотрудник другой компании");
    }
    if (employee.status === "fired") {
      throw new Error("Нельзя назначить SIM уволенному сотруднику");
    }
    const held = await ctx.db
      .query("simCards")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    const activeCount = held.filter((s) => `${s._id}` !== `${args.simCardId}`).length;
    if (activeCount >= employee.maxSim) {
      throw new Error(`Превышен лимит SIM сотрудника (maxSim=${employee.maxSim})`);
    }
  }
  if (args.contractId) {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Договор не найден");
    if (`${contract.companyId}` !== `${sim.companyId}` || `${contract.operatorId}` !== `${sim.operatorId}`) {
      throw new Error("Договор не соответствует компании/оператору SIM-карты");
    }
  }
  if(args.contractId && sim.contractId && args.contractId !== sim.contractId) throw new Error("Сначала измените договор в карточке номера");
  if(args.employeeId === sim.employeeId && (!args.contractId || args.contractId === sim.contractId)) return {ok:true};
  const now = Date.now();
  const open = await ctx.db
    .query("simAssignments")
    .withIndex("by_sim", (q) => q.eq("simCardId", args.simCardId))
    .collect();
  const current = open.find((a) => a.unassignedAt === undefined || a.unassignedAt === null);
  if (current) {
    await ctx.db.patch(current._id, { unassignedAt: now });
  }
  let assignmentId: string | undefined;
  if (args.employeeId) {
    const id = await ctx.db.insert("simAssignments", {
      simCardId: args.simCardId,
      employeeId: args.employeeId,
      contractId: args.contractId ?? sim.contractId,
      assignedAt: now,
      note: args.note,
      createdAt: now,
    });
    assignmentId = `${id}`;
    await ctx.db.patch(args.simCardId, { employeeId: args.employeeId });
  } else {
    await ctx.db.patch(args.simCardId, { employeeId: undefined });
  }
  await writeAudit(ctx, {
    entityType: "simAssignment",
    entityId: `${args.simCardId}`,
    action: args.employeeId ? "assigned" : "unassigned",
    details: { employeeId: args.employeeId ? `${args.employeeId}` : undefined, note: args.note },
  });
  return { ok: true, assignmentId };
}

export const assign = mutation({
  args: {
    simCardId: v.id("simCards"),
    employeeId: v.optional(v.id("employees")),
    contractId: v.optional(v.id("contracts")),
    note: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { simCardId: Id<"simCards">; employeeId?: Id<"employees">; contractId?: Id<"contracts">; note?: string },
  ): Promise<{ ok: boolean; assignmentId?: string }> => {
    await requireAuthIfEnabled(ctx);
    return await assignCore(ctx, args);
  },
});

export const unassign = mutation({
  args: { simCardId: v.id("simCards"), note: v.optional(v.string()) },
  handler: async (
    ctx: MutationCtx,
    args: { simCardId: Id<"simCards">; note?: string },
  ): Promise<{ ok: boolean; assignmentId?: string }> => {
    await requireAuthIfEnabled(ctx);
    return await assignCore(ctx, { simCardId: args.simCardId, employeeId: undefined, note: args.note });
  },
});
