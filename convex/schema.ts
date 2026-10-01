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
    resourceKind: v.optional(v.string()),
    // Explicit contract link (additive; legacy rows keep company/operator match).
    contractId: v.optional(v.id("contracts")),
    normalizedNumber: v.optional(v.string()),
    connectionAddress: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("blocked")),
    type: v.optional(v.string()),
    iccid: v.optional(v.string()),
    limit: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_employee", ["employeeId"])
    .index("by_operator", ["operatorId"])
    .index("by_tariff", ["tariffId"])
    .index("by_contract", ["contractId"]),

  // History of SIM assignments: who held the number and when.
  // Past charges are attributed via this history, never via the current owner.
  simAssignments: defineTable({
    simCardId: v.id("simCards"),
    employeeId: v.optional(v.id("employees")),
    contractId: v.optional(v.id("contracts")),
    assignedAt: v.number(),
    unassignedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sim", ["simCardId"])
    .index("by_employee", ["employeeId"])
    .index("by_contract", ["contractId"]),

  contracts: defineTable({
    number: v.string(),
    name: v.optional(v.string()),
    companyId: v.id("companies"),
    operatorId: v.id("operators"),
    type: v.string(),
    status: v.union(v.literal("active"), v.literal("closing"), v.literal("archived")),
    monthlyFee: v.optional(v.number()),
    amount: v.optional(v.number()), // legacy field for older records
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    simCount: v.optional(v.number()),
    feeBasis: v.optional(v.string()),
    dateBasis: v.optional(v.string()),
    endDateBasis: v.optional(v.string()),
    sourceInvoiceId: v.optional(v.id("invoices")),
    // Additive links/metadata (all optional, legacy rows untouched).
    normalizedNumber: v.optional(v.string()),
    serviceCategory: v.optional(v.string()),
    responsibleEmployeeId: v.optional(v.id("employees")),
    connectionAddress: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
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
    importId: v.optional(v.id("billingImports")),
    vat: v.optional(v.number()),
    total: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("confirmed"), v.literal("draft"), v.literal("adjusted"), v.literal("cancelled")),
    ),
    hasDocument: v.optional(v.boolean()),
    createdAt: v.number(),
    // Additive charge/allocation accounting. Missing kind on legacy rows means charge.
    kind: v.optional(v.union(v.literal("charge"), v.literal("allocation"))),
    contractId: v.optional(v.id("contracts")),
    simCardId: v.optional(v.id("simCards")),
    employeeId: v.optional(v.id("employees")),
    invoiceId: v.optional(v.id("invoices")),
    parentExpenseId: v.optional(v.id("expenses")),
    tariffId: v.optional(v.id("tariffs")),
    tariffName: v.optional(v.string()),
    serviceCategory: v.optional(v.string()),
    periodKey: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
    multiMonth: v.optional(v.boolean()),
    documentKey: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    voided: v.optional(v.boolean()),
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
    basis: v.optional(v.string()),
    description: v.optional(v.string()),
    sourcePage: v.optional(v.number()),
    sourceRowKey: v.optional(v.string()),
    vatBasis: v.optional(v.string()),
    serviceIdentifier: v.optional(v.string()),
  })
    .index("by_company", ["companyId"])
    .index("by_created", ["createdAt"])
    .index("by_month", ["month"])
    .index("by_company_month", ["companyId", "month"])
    .index("by_import", ["importId"])
    .index("by_contract", ["contractId"])
    .index("by_invoice", ["invoiceId"])
    .index("by_parent", ["parentExpenseId"])
    .index("by_period", ["periodKey"])
    .index("by_employee", ["employeeId"]),

  invoices: defineTable({
    fileId: v.id("_storage"),
    fileName: v.string(),
    operator: v.string(),
    kind: v.union(v.literal("invoice"), v.literal("detail")),
    invoiceNo: v.string(),
    invoiceDate: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    month: v.string(),
    contractNumber: v.string(),
    contractId: v.optional(v.id("contracts")),
    companyId: v.optional(v.id("companies")),
    amount: v.number(),
    vat: v.number(),
    total: v.number(),
    status: v.union(v.literal("draft"), v.literal("matched"), v.literal("void")),
    expenseId: v.optional(v.id("expenses")),
    note: v.optional(v.string()),
    createdAt: v.number(),
    // Additive document identity / reconciliation / retention.
    // identityKey is semantic (operator/company/invoiceNo/date/kind) and never
    // changes with total/period/contract corrections. contentSha256 is set only
    // by server actions from storage bytes, never from client arguments.
    documentKey: v.optional(v.string()),
    identityKey: v.optional(v.string()),
    contentSha256: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    fileHash: v.optional(v.string()),
    operatorId: v.optional(v.id("operators")),
    periodKey: v.optional(v.string()),
    multiMonth: v.optional(v.boolean()),
    vatRate: v.optional(v.number()),
    serviceTotal: v.optional(v.number()),
    amountDue: v.optional(v.number()),
    openingBalance: v.optional(v.number()),
    payments: v.optional(v.number()),
    vatBasis: v.optional(v.string()),
    appliedAt: v.optional(v.number()),
    voided: v.optional(v.boolean()),
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
  })
    .index("by_contract", ["contractId"])
    .index("by_company", ["companyId"])
    .index("by_created", ["createdAt"])
    .index("by_document", ["documentKey"])
    .index("by_period", ["periodKey"]),

  billingImports: defineTable({
    fileId: v.id("_storage"),
    fileName: v.string(),
    status: v.string(),
    createdAt: v.number(),
    appliedAt: v.optional(v.number()),
    // Additive idempotency: same file content under another name is the same import.
    fileHash: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    sourceKind: v.optional(v.string()),
    voided: v.optional(v.boolean()),
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
    previewSummary: v.optional(
      v.object({
        rows: v.number(),
        contractsMissing: v.number(),
        simCardsMissing: v.number(),
        tariffsMissing: v.number(),
        vatMismatches: v.optional(v.number()),
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
        chargesCreated: v.optional(v.number()),
        allocationsCreated: v.optional(v.number()),
        chargesAttached: v.optional(v.number()),
        unallocatedTotal: v.optional(v.number()),
        ambiguities: v.optional(v.number()),
      }),
    ),
    reconciliation: v.optional(
      v.object({
        groups: v.number(),
        chargesCreated: v.number(),
        chargesAttached: v.number(),
        allocationsCreated: v.number(),
        unallocatedTotal: v.number(),
        ambiguousGroups: v.number(),
      }),
    ),
  }),

  // Append-only audit log for financial / assignment changes.
  auditEvents: defineTable({
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    reason: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_created", ["createdAt"]),

  // Additive migration/backfill runs (dry-run or applied).
  migrationRuns: defineTable({
    name: v.string(),
    mode: v.union(v.literal("dry-run"), v.literal("applied")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    stats: v.optional(v.string()),
    ambiguities: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),
});
