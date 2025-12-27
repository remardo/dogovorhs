import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    inn: v.optional(v.string()),
    kpp: v.optional(v.string()),
    comment: v.optional(v.string()),
    contracts: v.optional(v.number()),
    simCards: v.optional(v.number()),
    employees: v.optional(v.number()),
    monthlyExpense: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  operators: defineTable({
    name: v.string(),
    type: v.optional(v.string()),
    manager: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    contracts: v.optional(v.number()),
    simCards: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  tariffs: defineTable({
    name: v.string(),
    operatorId: v.id("operators"),
    monthlyFee: v.number(),
    dataLimitGb: v.optional(v.number()),
    minutes: v.optional(v.number()),
    sms: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("archive"))),
    simCount: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_operator", ["operatorId"]),

  employees: defineTable({
    name: v.string(),
    companyId: v.id("companies"),
    department: v.string(),
    position: v.string(),
    status: v.union(v.literal("active"), v.literal("fired")),
    simCount: v.number(),
    maxSim: v.number(),
    createdAt: v.number(),
  }).index("by_company", ["companyId"]),

  simCards: defineTable({
    number: v.string(),
    companyId: v.id("companies"),
    employeeId: v.optional(v.id("employees")),
    operatorId: v.id("operators"),
    tariffId: v.optional(v.id("tariffs")),
    status: v.union(v.literal("active"), v.literal("blocked")),
    type: v.optional(v.string()),
    iccid: v.optional(v.string()),
    limit: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_employee", ["employeeId"])
    .index("by_operator", ["operatorId"])
    .index("by_tariff", ["tariffId"]),

  contracts: defineTable({
    number: v.string(),
    companyId: v.id("companies"),
    operatorId: v.id("operators"),
    type: v.string(),
    status: v.union(v.literal("active"), v.literal("closing")),
    monthlyFee: v.optional(v.number()),
    amount: v.optional(v.number()), // legacy field for older records
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    simCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_operator", ["operatorId"])
    .index("by_created", ["createdAt"]),

  expenses: defineTable({
    companyId: v.id("companies"),
    type: v.string(),
    amount: v.number(),
    month: v.string(),
    simNumber: v.optional(v.string()),
    contract: v.optional(v.string()),
    operator: v.optional(v.string()),
    vat: v.optional(v.number()),
    total: v.optional(v.number()),
    status: v.optional(v.union(v.literal("confirmed"), v.literal("draft"), v.literal("adjusted"))),
    hasDocument: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_created", ["createdAt"])
    .index("by_month", ["month"])
    .index("by_company_month", ["companyId", "month"]),

  billingImports: defineTable({
    fileId: v.id("_storage"),
    fileName: v.string(),
    status: v.string(),
    createdAt: v.number(),
    appliedAt: v.optional(v.number()),
    previewSummary: v.optional(
      v.object({
        rows: v.number(),
        contractsMissing: v.number(),
        simCardsMissing: v.number(),
        tariffsMissing: v.number(),
        vatMismatches: v.number(),
        totalAmount: v.number(),
        totalVat: v.number(),
        totalTotal: v.number(),
      }),
    ),
    appliedSummary: v.optional(
      v.object({
        expensesCreated: v.number(),
        simCardsCreated: v.number(),
        tariffsCreated: v.number(),
        contractsCreated: v.number(),
      }),
    ),
  }),
});
