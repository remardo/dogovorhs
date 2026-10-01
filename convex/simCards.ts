import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { writeAudit } from "./_lib/audit";

function normalizeSim(number: string): string {
  return number.replace(/\D/g, "");
}

export type SimListItem = {
  id: string;
  number: string;
  normalizedNumber: string;
  iccid: string;
  type: string;
  status: "active" | "blocked";
  operatorId: Id<"operators">;
  operator: string;
  companyId: Id<"companies">;
  company: string;
  contractId?: string;
  contractNumber: string;
  employeeId?: string;
  employee: string;
  tariffId?: string;
  tariff: string;
  limit: number;
  connectionAddress: string;
};

export type SimListResult = {
  items: SimListItem[];
  companies: { id: string; name: string }[];
  operators: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  tariffs: { id: string; name: string }[];
  contracts: { id: string; name: string }[];
};

export type SimHistory = {
  sim: Doc<"simCards">;
  assignments: { id: string; employeeId?: string; contractId?: string; assignedAt: number; unassignedAt?: number; note: string }[];
  expenses: { id: string; month: string; periodKey?: string; kind: string; total: number; employeeId?: string }[];
};

async function assertSimLinks(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    operatorId: Id<"operators">;
    employeeId?: Id<"employees">;
    tariffId?: Id<"tariffs">;
    contractId?: Id<"contracts">;
    excludeSimId?: Id<"simCards">;
  },
): Promise<void> {
  const [company, operator] = await Promise.all([
    ctx.db.get(args.companyId),
    ctx.db.get(args.operatorId),
  ]);
  if (!company) throw new Error("Компания не найдена");
  if (!operator) throw new Error("Оператор не найден");
  if (args.contractId) {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Договор не найден");
    if (`${contract.companyId}` !== `${args.companyId}`) {
      throw new Error("Договор не принадлежит компании SIM-карты");
    }
    if (`${contract.operatorId}` !== `${args.operatorId}`) {
      throw new Error("Оператор договора не совпадает с оператором SIM-карты");
    }
  }
  if (args.employeeId) {
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Сотрудник не найден");
    if (`${employee.companyId}` !== `${args.companyId}`) {
      throw new Error("Сотрудник другой компании");
    }
    if (employee.status === "fired") {
      throw new Error("Нельзя назначить SIM уволенному сотруднику");
    }
    const sims = await ctx.db
      .query("simCards")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    const activeCount = sims.filter(
      (s) => !args.excludeSimId || `${s._id}` !== `${args.excludeSimId}`,
    ).length;
    if (activeCount >= employee.maxSim) {
      throw new Error(`Превышен лимит SIM сотрудника (maxSim=${employee.maxSim})`);
    }
  }
  if (args.tariffId) {
    const tariff = await ctx.db.get(args.tariffId);
    if (!tariff) throw new Error("Тариф не найден");
    if (`${tariff.operatorId}` !== `${args.operatorId}`) {
      throw new Error("Тариф другого оператора");
    }
  }
}

async function trackAssignment(
  ctx: MutationCtx,
  simCardId: Id<"simCards">,
  prevEmployeeId: Id<"employees"> | undefined,
  nextEmployeeId: Id<"employees"> | undefined,
  contractId: Id<"contracts"> | undefined,
): Promise<void> {
  if (`${prevEmployeeId ?? ""}` === `${nextEmployeeId ?? ""}`) return;
  const now = Date.now();
  const assignments = await ctx.db
    .query("simAssignments")
    .withIndex("by_sim", (q) => q.eq("simCardId", simCardId))
    .collect();
  const open = assignments.find((a) => a.unassignedAt === undefined || a.unassignedAt === null);
  if (open) {
    await ctx.db.patch(open._id, { unassignedAt: now });
  }
  if (nextEmployeeId) {
    await ctx.db.insert("simAssignments", {
      simCardId,
      employeeId: nextEmployeeId,
      contractId,
      assignedAt: now,
      createdAt: now,
    });
  }
  await writeAudit(ctx, {
    entityType: "simCard",
    entityId: `${simCardId}`,
    action: nextEmployeeId ? "assigned" : "unassigned",
    details: {
      from: prevEmployeeId ? `${prevEmployeeId}` : undefined,
      to: nextEmployeeId ? `${nextEmployeeId}` : undefined,
    },
  });
}

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<SimListResult> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [sims, companies, operators, employees, tariffs, contracts] = await Promise.all([
      db.query("simCards").order("desc").collect(),
      db.query("companies").collect(),
      db.query("operators").collect(),
      db.query("employees").collect(),
      db.query("tariffs").collect(),
      db.query("contracts").collect(),
    ]);

    const companyById = new Map<string, string>(companies.map((c) => [`${c._id}`, c.name]));
    const operatorById = new Map<string, string>(operators.map((o) => [`${o._id}`, o.name]));
    const employeeById = new Map<string, string>(employees.map((e) => [`${e._id}`, e.name]));
    const tariffById = new Map<string, string>(tariffs.map((t) => [`${t._id}`, t.name]));
    const contractById = new Map<string, Doc<"contracts">>(contracts.map((c) => [`${c._id}`, c]));

    const items: SimListItem[] = [...sims]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((sim) => {
        const contract = sim.contractId ? contractById.get(`${sim.contractId}`) : undefined;
        return {
          id: `${sim._id}`,
          number: sim.number,
          normalizedNumber: sim.normalizedNumber ?? normalizeSim(sim.number),
          iccid: sim.iccid ?? "",
          type: sim.type ?? "Голосовая",
          status: sim.status,
          operatorId: sim.operatorId,
          operator: operatorById.get(`${sim.operatorId}`) ?? "Оператор",
          companyId: sim.companyId,
          company: companyById.get(`${sim.companyId}`) ?? "Компания",
          contractId: sim.contractId ? `${sim.contractId}` : undefined,
          contractNumber: contract?.number ?? "",
          employeeId: sim.employeeId ? `${sim.employeeId}` : undefined,
          employee: sim.employeeId ? (employeeById.get(`${sim.employeeId}`) ?? "") : "",
          tariffId: sim.tariffId ? `${sim.tariffId}` : undefined,
          tariff: sim.tariffId ? (tariffById.get(`${sim.tariffId}`) ?? "") : "",
          limit: sim.limit ?? 0,
          connectionAddress: sim.connectionAddress ?? "",
        };
      });

    return {
      items,
      companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
      operators: operators.map((o) => ({ id: `${o._id}`, name: o.name })),
      employees: employees.map((e) => ({ id: `${e._id}`, name: e.name })),
      tariffs: tariffs.map((t) => ({ id: `${t._id}`, name: t.name })),
      contracts: contracts.map((c) => ({ id: `${c._id}`, name: c.number })),
    };
  },
});

export const getHistory = query({
  args: { id: v.id("simCards"), periodKey: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (
    ctx: QueryCtx,
    { id, periodKey, limit }: { id: Id<"simCards">; periodKey?: string; limit?: number },
  ): Promise<SimHistory> => {
    await requireAuthIfEnabled(ctx);
    const sim = await ctx.db.get(id);
    if (!sim) throw new Error("SIM-карта не найдена");
    const [assignments, expenses] = await Promise.all([
      ctx.db.query("simAssignments").withIndex("by_sim", (q) => q.eq("simCardId", id)).collect(),
      ctx.db.query("expenses").collect(),
    ]);
    const history = [...assignments].sort((a, b) => b.assignedAt - a.assignedAt);
    const tail7 = sim.number.slice(-7);
    let charges = expenses.filter(
      (e) =>
        !e.voided &&
        ((e.simCardId && `${e.simCardId}` === `${id}`) ||
          (!e.simCardId && e.simNumber && tail7.includes(e.simNumber.slice(-7)))),
    );
    if (periodKey) {
      charges = charges.filter((e) => (e.periodKey ?? e.month) === periodKey || e.month === periodKey);
    }
    const capped = charges.slice(0, Math.max(1, Math.min(limit ?? 200, 2000)));
    return {
      sim,
      assignments: history.map((a) => ({
        id: `${a._id}`,
        employeeId: a.employeeId ? `${a.employeeId}` : undefined,
        contractId: a.contractId ? `${a.contractId}` : undefined,
        assignedAt: a.assignedAt,
        unassignedAt: a.unassignedAt,
        note: a.note ?? "",
      })),
      expenses: capped.map((e) => ({
        id: `${e._id}`,
        month: e.month,
        periodKey: e.periodKey,
        kind: e.kind ?? "charge",
        total: e.total ?? e.amount + (e.vat ?? 0),
        employeeId: e.employeeId ? `${e.employeeId}` : undefined,
      })),
    };
  },
});

export type SimWriteInput = {
  number: string;
  iccid?: string;
  type?: string;
  companyId: Id<"companies">;
  operatorId: Id<"operators">;
  contractId?: Id<"contracts">;
  employeeId?: Id<"employees">;
  tariffId?: Id<"tariffs">;
  status: "active" | "blocked";
  limit?: number;
  connectionAddress?: string;
};

const simWriteValidator = {
  number: v.string(),
  iccid: v.optional(v.string()),
  type: v.optional(v.string()),
  companyId: v.id("companies"),
  operatorId: v.id("operators"),
  contractId: v.optional(v.id("contracts")),
  employeeId: v.optional(v.id("employees")),
  tariffId: v.optional(v.id("tariffs")),
  status: v.union(v.literal("active"), v.literal("blocked")),
  limit: v.optional(v.number()),
  connectionAddress: v.optional(v.string()),
};

async function assertUniqueNumber(
  ctx: MutationCtx,
  number: string,
  companyId: Id<"companies">,
  excludeId?: Id<"simCards">,
): Promise<void> {
  const norm = normalizeSim(number);
  const all = await ctx.db.query("simCards").collect();
  const clash = all.find(
    (s) =>
      (!excludeId || `${s._id}` !== `${excludeId}`) &&
      (s.number === number || (s.normalizedNumber ?? normalizeSim(s.number)) === norm) &&
      `${s.companyId}` === `${companyId}`,
  );
  if (clash) {
    throw new Error("SIM-карта с таким номером уже существует в этой компании");
  }
}

export const create = mutation({
  args: simWriteValidator,
  handler: async (ctx: MutationCtx, args: SimWriteInput): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    if (!args.number.trim()) throw new Error("Номер SIM обязателен");
    await assertSimLinks(ctx, {
      companyId: args.companyId,
      operatorId: args.operatorId,
      employeeId: args.employeeId,
      tariffId: args.tariffId,
      contractId: args.contractId,
    });
    await assertUniqueNumber(ctx, args.number, args.companyId);

    if (args.iccid) {
      const all = await db.query("simCards").collect();
      if (all.some((s) => s.iccid === args.iccid)) {
        throw new Error("SIM-карта с таким ICCID уже существует");
      }
    }
    const id = await db.insert("simCards", {
      ...args,
      normalizedNumber: normalizeSim(args.number),
      createdAt: Date.now(),
    });
    if (args.employeeId) {
      await trackAssignment(ctx, id, undefined, args.employeeId, args.contractId);
    }
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("simCards") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"simCards"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [expenses, assignments] = await Promise.all([
      db.query("expenses").collect(),
      db.query("simAssignments").withIndex("by_sim", (q) => q.eq("simCardId", id)).collect(),
    ]);
    const used =
      expenses.some((e) => e.simCardId && `${e.simCardId}` === `${id}`) ||
      assignments.length > 0;
    if (used) {
      throw new Error("Нельзя удалить SIM с начислениями/историей назначений");
    }
    await db.delete(id);
    return { ok: true };
  },
});

export const update = mutation({
  args: { ...simWriteValidator, id: v.id("simCards") },
  handler: async (
    ctx: MutationCtx,
    args: SimWriteInput & { id: Id<"simCards"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const prev = await db.get(id);
    if (!prev) throw new Error("SIM-карта не найдена");
    await assertSimLinks(ctx, {
      companyId: rest.companyId,
      operatorId: rest.operatorId,
      employeeId: rest.employeeId,
      tariffId: rest.tariffId,
      contractId: rest.contractId,
      excludeSimId: id,
    });
    await assertUniqueNumber(ctx, rest.number, rest.companyId, id);

    if (rest.iccid) {
      const all = await db.query("simCards").collect();
      if (all.some((s) => `${s._id}` !== `${id}` && s.iccid === rest.iccid)) {
        throw new Error("SIM-карта с таким ICCID уже существует");
      }
    }
    await db.patch(id, { ...rest, normalizedNumber: normalizeSim(rest.number) });
    await trackAssignment(
      ctx,
      id,
      prev.employeeId,
      rest.employeeId,
      rest.contractId ?? prev.contractId,
    );
    return { ok: true };
  },
});

/** Explicit assign/unassign with nullable employee (avoids undefined ambiguity). */
export const assign = mutation({
  args: {
    id: v.id("simCards"),
    employeeId: v.union(v.id("employees"), v.null()),
    contractId: v.optional(v.id("contracts")),
    note: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"simCards">; employeeId: Id<"employees"> | null; contractId?: Id<"contracts">; note?: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const sim = await ctx.db.get(args.id);
    if (!sim) throw new Error("SIM-карта не найдена");
    if (args.employeeId) {
      await assertSimLinks(ctx, {
        companyId: sim.companyId,
        operatorId: sim.operatorId,
        employeeId: args.employeeId,
        excludeSimId: args.id,
      });
    }
    if (args.contractId) {
      const contract = await ctx.db.get(args.contractId);
      if (!contract) throw new Error("Договор не найден");
      if (`${contract.companyId}` !== `${sim.companyId}` || `${contract.operatorId}` !== `${sim.operatorId}`) {
        throw new Error("Договор не соответствует компании/оператору SIM-карты");
      }
    }
    const contractId = args.contractId ?? sim.contractId;
    await ctx.db.patch(args.id, {
      employeeId: args.employeeId ?? undefined,
      ...(args.contractId ? { contractId: args.contractId } : {}),
    });
    await trackAssignment(ctx, args.id, sim.employeeId, args.employeeId ?? undefined, contractId);
    if (args.note) {
      await writeAudit(ctx, {
        entityType: "simCard",
        entityId: `${args.id}`,
        action: "assignment_note",
        details: { note: args.note },
      });
    }
    return { ok: true };
  },
});
