import { v } from "convex/values";
export const verifiedDocument = v.object({
  invoiceId: v.id("invoices"), sha256: v.string(), expectedTotal: v.number(),
  expectedContractFee: v.optional(v.number()), expectedContractStartDate: v.optional(v.string()),
  parentInvoiceId: v.optional(v.id("invoices")),
  periodStart: v.string(), periodEnd: v.string(), serviceTotal: v.number(),
  amountDue: v.optional(v.number()), openingBalance: v.optional(v.number()), payments: v.optional(v.number()),
  vatRate: v.optional(v.number()), contractStartDate: v.optional(v.string()), serviceCategory: v.optional(v.string()),
  rows: v.array(v.object({ sourcePage: v.number(), evidence: v.string(), number: v.string(),
    value: v.number(), basis: v.union(v.literal("net"),v.literal("gross")), description: v.string(),
    serviceIdentifier: v.string(), resourceKind: v.optional(v.string()), address: v.optional(v.string()), iccid: v.optional(v.string()) })),
});
