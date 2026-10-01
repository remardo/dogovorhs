import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuthIfEnabled } from "./_lib/auth";
import { normalizeContractNumber } from "./_lib/accounting";
import { writeAudit } from "./_lib/audit";

export type ContractListItem = {
  id: string;
  number: string;
  name: string;
  companyId: Id<"companies">;
  company: string;
  operatorId: Id<"operators">;
  operator: string;
  type: string;
  serviceCategory: string;
  normalizedNumber: string;
  status: "active" | "closing" | "archived";
  archived: boolean;
  startDate: string;
  endDate: string;
  monthlyFee: number;
  feeBasis?: string;
  dateBasis?: string;
  endDateBasis?: string;
  simCount: number;
  computedSimCount: number;
  responsibleEmployeeId?: string;
  responsibleEmployee: string;
  connectionAddress: string;
  archiveReason: string;
};

export type ContractListResult = {
  items: ContractListItem[];
  companies: { id: string; name: string }[];
  operators: { id: string; name: string }[];
};

export type ContractHistory = {
  contract: Doc<"contracts">;
  invoices: { id: string; kind: "invoice" | "detail"; invoiceNo: string; month: string; periodKey?: string; total: number; voided: boolean }[];
  charges: { id: string; month: string; periodKey?: string; total: number; invoiceId?: string }[];
  simCards: { id: string; number: string }[];
  assignments: { id: string; simCardId: string; employeeId?: string; assignedAt: number; unassignedAt?: number }[];
};

export const list = query({
  args: {},
  handler: async (ctx: QueryCtx): Promise<ContractListResult> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [contracts, companies, operators, simCards, employees] = await Promise.all([
      db.query("contracts").collect(),
      db.query("companies").collect(),
      db.query("operators").collect(),
      db.query("simCards").collect(),
      db.query("employees").collect(),
    ]);

    const companyById = new Map<string, string>(companies.map((c) => [`${c._id}`, c.name]));
    const operatorById = new Map<string, string>(operators.map((o) => [`${o._id}`, o.name]));
    const employeeById = new Map<string, string>(employees.map((e) => [`${e._id}`, e.name]));
    const simCountByContract = new Map<string, number>();
    for (const sim of simCards) {
      if (sim.contractId) {
        simCountByContract.set(`${sim.contractId}`, (simCountByContract.get(`${sim.contractId}`) ?? 0) + 1);
      }
    }

    const items: ContractListItem[] = [...contracts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((contract) => ({
        id: `${contract._id}`,
        number: contract.number,
        name: contract.name ?? "",
        companyId: contract.companyId,
        company: companyById.get(`${contract.companyId}`) ?? "Компания",
        operatorId: contract.operatorId,
        operator: operatorById.get(`${contract.operatorId}`) ?? "Оператор",
        type: contract.type,
        serviceCategory: contract.serviceCategory ?? contract.type,
        normalizedNumber: contract.normalizedNumber ?? normalizeContractNumber(contract.number),
        status: contract.status,
        archived: contract.archived ?? contract.status === "archived",
        startDate: contract.startDate ?? "",
        endDate: contract.endDate ?? "Бессрочный",
        monthlyFee: contract.monthlyFee ?? contract.amount ?? 0,
        feeBasis:contract.feeBasis,dateBasis:contract.dateBasis,endDateBasis:contract.endDateBasis,
        simCount: contract.simCount ?? 0,
        computedSimCount: simCountByContract.get(`${contract._id}`) ?? 0,
        responsibleEmployeeId: contract.responsibleEmployeeId
          ? `${contract.responsibleEmployeeId}`
          : undefined,
        responsibleEmployee: contract.responsibleEmployeeId
          ? (employeeById.get(`${contract.responsibleEmployeeId}`) ?? "")
          : "",
        connectionAddress: contract.connectionAddress ?? "",
        archiveReason: contract.archiveReason ?? "",
      }));

    return {
      items,
      companies: companies.map((c) => ({ id: `${c._id}`, name: c.name })),
      operators: operators.map((o) => ({ id: `${o._id}`, name: o.name })),
    };
  },
});

export const getWithHistory = query({
  args: { id: v.id("contracts") },
  handler: async (ctx: QueryCtx, { id }: { id: Id<"contracts"> }): Promise<ContractHistory> => {
    await requireAuthIfEnabled(ctx);
    const contract = await ctx.db.get(id);
    if (!contract) throw new Error("Договор не найден");
    const [invoices, expenses, simCards, assignments] = await Promise.all([
      ctx.db.query("invoices").collect(),
      ctx.db.query("expenses").collect(),
      ctx.db.query("simCards").collect(),
      ctx.db.query("simAssignments").collect(),
    ]);
    // Scoped fallback: same number only within the same company AND operator.
    const contractInvoices = invoices.filter(
      (i) =>
        (i.contractId && `${i.contractId}` === `${id}`) ||
        (!i.contractId &&
          i.contractNumber === contract.number &&
          i.companyId &&
          `${i.companyId}` === `${contract.companyId}` &&
          (!i.operatorId || `${i.operatorId}` === `${contract.operatorId}`)),
    );
    const charges = expenses.filter(
      (e) =>
        !e.voided &&
        e.kind !== "allocation" &&
        ((e.contractId && `${e.contractId}` === `${id}`) ||
          (!e.contractId &&
            e.contract === contract.number &&
            `${e.companyId}` === `${contract.companyId}`)),
    );
    const linkedSims = simCards.filter((s) => s.contractId && `${s.contractId}` === `${id}`);
    return {
      contract,
      invoices: contractInvoices.map((i) => ({
        id: `${i._id}`,
        kind: i.kind,
        invoiceNo: i.invoiceNo,
        month: i.month,
        periodKey: i.periodKey,
        total: i.total,
        voided: i.voided ?? false,
      })),
      charges: charges.map((c) => ({
        id: `${c._id}`,
        month: c.month,
        periodKey: c.periodKey,
        total: c.total ?? c.amount + (c.vat ?? 0),
        invoiceId: c.invoiceId ? `${c.invoiceId}` : undefined,
      })),
      simCards: linkedSims.map((s) => ({ id: `${s._id}`, number: s.number })),
      assignments: assignments
        .filter((a) => a.contractId && `${a.contractId}` === `${id}`)
        .map((a) => ({
          id: `${a._id}`,
          simCardId: `${a.simCardId}`,
          employeeId: a.employeeId ? `${a.employeeId}` : undefined,
          assignedAt: a.assignedAt,
          unassignedAt: a.unassignedAt,
        })),
    };
  },
});

async function assertResponsible(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  responsibleEmployeeId: Id<"employees"> | undefined,
): Promise<void> {
  if (!responsibleEmployeeId) return;
  const employee = await ctx.db.get(responsibleEmployeeId);
  if (!employee) throw new Error("Ответственный сотрудник не найден");
  if (`${employee.companyId}` !== `${companyId}`) {
    throw new Error("Ответственный должен быть сотрудником компании договора");
  }
  if (employee.status === "fired") {
    throw new Error("Нельзя назначить ответственным уволенного сотрудника");
  }
}

export type ContractWriteInput = {
  number: string;
  name?: string;
  companyId: Id<"companies">;
  operatorId: Id<"operators">;
  type: string;
  serviceCategory?: string;
  status: "active" | "closing" | "archived";
  startDate: string;
  endDate: string;
  monthlyFee: number;
  feeBasis?: string;
  dateBasis?: string;
  endDateBasis?: string;
  simCount: number;
  responsibleEmployeeId?: Id<"employees">;
  connectionAddress?: string;
};

const contractWriteValidator = {
  number: v.string(),
  name: v.optional(v.string()),
  companyId: v.id("companies"),
  operatorId: v.id("operators"),
  type: v.string(),
  serviceCategory: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("closing"), v.literal("archived")),
  startDate: v.string(),
  endDate: v.string(),
  monthlyFee: v.number(),
  simCount: v.number(),
  responsibleEmployeeId: v.optional(v.id("employees")),
  connectionAddress: v.optional(v.string()),
};

export async function createContractCore(
  ctx: MutationCtx,
  args: ContractWriteInput,
): Promise<{ ok: boolean; id: string }> {
  const { db } = ctx;
  const existing = await db
    .query("contracts")
    .filter((q) => q.and(q.eq(q.field("number"), args.number),q.eq(q.field("companyId"),args.companyId),q.eq(q.field("operatorId"),args.operatorId)))
    .first();
  if (existing) {
    throw new Error("Договор с таким номером уже существует");
  }
  const [company, operator] = await Promise.all([db.get(args.companyId), db.get(args.operatorId)]);
  if (!company) throw new Error("Компания не найдена");
  if (!operator) throw new Error("Оператор не найден");
  await assertResponsible(ctx, args.companyId, args.responsibleEmployeeId);
  const id = await db.insert("contracts", {
    ...args,
    normalizedNumber: normalizeContractNumber(args.number),
    serviceCategory: args.serviceCategory ?? args.type,
    feeBasis:"contract",dateBasis:"manual",endDateBasis:"manual",
    createdAt: Date.now(),
  });
  await writeAudit(ctx, { entityType: "contract", entityId: args.number, action: "created" });
  return { ok: true, id: `${id}` };
}

export const create = mutation({
  args: contractWriteValidator,
  handler: async (ctx: MutationCtx, args: ContractWriteInput): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    await createContractCore(ctx, args);
    return { ok: true };
  },
});

export const update = mutation({
  args: { ...contractWriteValidator, id: v.id("contracts") },
  handler: async (
    ctx: MutationCtx,
    args: ContractWriteInput & { id: Id<"contracts"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const { id, ...rest } = args;
    const previous=await db.get(id);
    if(!previous)throw new Error("Договор не найден");
    if(previous.companyId!==rest.companyId || previous.operatorId!==rest.operatorId){
      const invoices=await db.query("invoices").withIndex("by_contract",q=>q.eq("contractId",id)).take(1);
      const expenses=await db.query("expenses").withIndex("by_contract",q=>q.eq("contractId",id)).take(1);
      const sims=await db.query("simCards").withIndex("by_contract",q=>q.eq("contractId",id)).take(1);
      if(invoices.length||expenses.length||sims.length)throw new Error("Для договора с историей нельзя менять компанию или оператора; создайте новый договор");
    }
    const [company, operator] = await Promise.all([db.get(rest.companyId), db.get(rest.operatorId)]);
    if (!company) throw new Error("Компания не найдена");
    if (!operator) throw new Error("Оператор не найден");
    await assertResponsible(ctx, rest.companyId, rest.responsibleEmployeeId);

    const duplicate = await db
      .query("contracts")
      .filter((q) => q.and(q.eq(q.field("number"), rest.number), q.eq(q.field("companyId"),rest.companyId),q.eq(q.field("operatorId"),rest.operatorId),q.neq(q.field("_id"), id)))
      .first();
    if (duplicate) {
      throw new Error("Договор с таким номером уже существует");
    }
    await db.patch(id, {
      ...rest,
      feeBasis:previous.monthlyFee!==rest.monthlyFee ? "contract" : previous.feeBasis,
      dateBasis:previous.startDate!==rest.startDate ? "manual" : previous.dateBasis,
      endDateBasis:previous.endDate!==rest.endDate ? "manual" : previous.endDateBasis,
      normalizedNumber: normalizeContractNumber(rest.number),
      serviceCategory: rest.serviceCategory ?? rest.type,
    });
    await writeAudit(ctx, { entityType: "contract", entityId: `${id}`, action: "updated" });
    return { ok: true };
  },
});

export const archive = mutation({
  args: { id: v.id("contracts"), reason: v.string() },
  handler: async (
    ctx: MutationCtx,
    { id, reason }: { id: Id<"contracts">; reason: string },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    if (!reason.trim()) throw new Error("Причина архивирования обязательна");
    const contract = await ctx.db.get(id);
    if (!contract) throw new Error("Договор не найден");
    await ctx.db.patch(id, {
      status: "archived",
      archived: true,
      archivedAt: Date.now(),
      archiveReason: reason,
    });
    await writeAudit(ctx, { entityType: "contract", entityId: `${id}`, action: "archived", reason });
    return { ok: true };
  },
});

export const updateOperator = mutation({
  args: { id: v.id("contracts"), operatorId: v.id("operators") },
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<"contracts">; operatorId: Id<"operators"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const contract = await db.get(args.id);
    if (!contract) throw new Error("Договор не найден");
    const operator = await db.get(args.operatorId);
    if (!operator) throw new Error("Оператор не найден");
    await db.patch(args.id, { operatorId: args.operatorId });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("contracts") },
  handler: async (
    ctx: MutationCtx,
    { id }: { id: Id<"contracts"> },
  ): Promise<{ ok: boolean }> => {
    await requireAuthIfEnabled(ctx);
    const { db } = ctx;
    const [invoices, expenses, simCards] = await Promise.all([
      db.query("invoices").collect(),
      db.query("expenses").collect(),
      db.query("simCards").collect(),
    ]);
    const used =
      invoices.some((i) => i.contractId && `${i.contractId}` === `${id}`) ||
      expenses.some((e) => e.contractId && `${e.contractId}` === `${id}`) ||
      simCards.some((s) => s.contractId && `${s.contractId}` === `${id}`);
    if (used) {
      throw new Error("Нельзя удалить договор с документами/начислениями/SIM: используйте archive");
    }
    await db.delete(id);
    return { ok: true };
  },
});
