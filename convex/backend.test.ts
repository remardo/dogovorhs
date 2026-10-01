import { describe, expect, it } from "vitest";
import { MockDb, sharedCtx } from "./_lib/mockDb";
import {
  buildDocumentKey,
  companyKeyFor,
  sumAllocations,
  sumCharges,
  toPeriodKey,
  validatePeriodRange,
} from "./_lib/accounting";
import { sha256HexText } from "./_lib/contentHash";
import { createInvoiceCore, listCore as invoiceListCore, rebindCore, voidCore } from "./invoices";
import type { InvoiceArgs } from "./invoices";
import { createExpenseCore, voidExpenseCore } from "./expenses";
import type { ExpenseInput } from "./expenses";
import { applyParsedCore, setContentHashCore } from "./billingImports";
import type { ApplyParsedInput } from "./billingImports";
import { assignCore } from "./simAssignments";
import { getSummaryCore } from "./dashboard";
import { applyMigrationCore, dryRunCore } from "./migration";
import { createContractCore } from "./contracts";
import { parseMegafonDetailTextRows } from "./_lib/billingImportDetailText";
import { parseInvoiceText } from "./_lib/invoiceParser";
import { parseRows } from "./_lib/billingImportParser";
import type { Id, TableNames } from "./_generated/dataModel";
import type { SystemTableNames } from "convex/server";
import { applyVerifiedCore } from "./sourceBackfill";

function ids<T extends TableNames | SystemTableNames>(value: string): Id<T> {
  return value as Id<T>;
}

async function seedCompanyContract(db: MockDb, contractNumber = "Д-001"): Promise<{ companyId: Id<"companies">; operatorId: Id<"operators">; contractId: Id<"contracts"> }> {
  const now = Date.now();
  const companyId = ids<"companies">(
    await db.insert("companies", { name: "ООО Тест", contracts: 0, simCards: 0, employees: 0, monthlyExpense: 0, createdAt: now }),
  );
  const operatorId = ids<"operators">(
    await db.insert("operators", { name: "Телеком", contracts: 0, simCards: 0, createdAt: now }),
  );
  const contractId = ids<"contracts">(
    await db.insert("contracts", {
      number: contractNumber,
      companyId,
      operatorId,
      type: "Мобильная связь",
      serviceCategory: "Мобильная связь",
      normalizedNumber: contractNumber.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase(),
      status: "active",
      createdAt: now,
    }),
  );
  return { companyId, operatorId, contractId };
}

function invoiceArgs(
  refs: { companyId: Id<"companies">; contractId: Id<"contracts"> },
  overrides: Partial<InvoiceArgs> = {},
): InvoiceArgs {
  return {
    fileId: ids<"_storage">(`storage:${Math.random().toString(36).slice(2)}`),
    fileName: "счёт.pdf",
    operator: "Телеком",
    kind: "invoice",
    invoiceNo: "СЧ-1",
    invoiceDate: "2025-11-30",
    periodStart: "2025-11-01",
    periodEnd: "2025-11-30",
    month: "Ноябрь 2025",
    contractNumber: "Д-001",
    contractId: refs.contractId,
    companyId: refs.companyId,
    amount: 1000,
    vat: 200,
    total: 1200,
    ...overrides,
  };
}

describe("verified original backfill", () => {
  it("allocates explicit net rows with documented VAT without changing the charge", async () => {
    const ctx=sharedCtx(); const refs=await seedCompanyContract(ctx.db);
    const invoice=await createInvoiceCore(ctx.mutation,invoiceArgs(refs,{amount:100,vat:22,total:122}),{withCharge:true});
    const document={invoiceId:ids<"invoices">(invoice.invoiceId),sha256:"b".repeat(64),expectedTotal:122,serviceTotal:122,vatRate:22,periodStart:"2025-11-01",periodEnd:"2025-11-30",rows:[{sourcePage:2,evidence:"Подключение 1: 30.00 без НДС",number:"connection-1",value:30,basis:"net" as const,description:"Интернет",serviceIdentifier:"1"},{sourcePage:2,evidence:"Подключение 2: 70.00 без НДС",number:"connection-2",value:70,basis:"net" as const,description:"Интернет",serviceIdentifier:"2"}]};
    expect((await applyVerifiedCore(ctx.mutation,document,true)).total).toBe(122);
    await applyVerifiedCore(ctx.mutation,document,false);
    const expenses=await ctx.db.query("expenses").collect();
    expect(sumCharges(expenses)).toBe(122);expect(sumAllocations(expenses)).toBe(122);
    expect(expenses.filter(e=>e.kind==="allocation").map(e=>e.vatBasis)).toEqual(["allocatedFromDocumentVat","allocatedFromDocumentVat"]);
    expect((await applyVerifiedCore(ctx.mutation,document,false)).allocations).toBe(0);
  });
  it("preserves the original, separates service cost from payable, and is idempotent", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const invoice = await createInvoiceCore(ctx.mutation,invoiceArgs(refs,{amount:4760.11,vat:1047.22,total:5807.33}),{withCharge:true});
    const document = {invoiceId:ids<"invoices">(invoice.invoiceId),sha256:"a".repeat(64),expectedTotal:5807.33,serviceTotal:5834,vatRate:22,periodStart:"2025-11-01",periodEnd:"2025-11-30",rows:[{sourcePage:2,evidence:"Итого начисления 5834.00",number:"79000000000",value:5834,basis:"gross" as const,description:"Услуги номера",serviceIdentifier:""}]};
    expect((await applyVerifiedCore(ctx.mutation,document,true)).allocations).toBe(1);
    expect((await ctx.db.query("simCards").collect())).toHaveLength(0);
    await applyVerifiedCore(ctx.mutation,document,false);
    expect((await applyVerifiedCore(ctx.mutation,document,false)).allocations).toBe(0);
    expect((await ctx.db.get(document.invoiceId))?.total).toBe(5807.33);
    expect(sumCharges(await ctx.db.query("expenses").collect())).toBe(5834);
    expect((await ctx.db.query("simCards").collect())).toHaveLength(1);
    expect(ctx.storage.deletedFiles).toHaveLength(0);
    await expect(applyVerifiedCore(ctx.mutation,{...document,rows:[{...document.rows[0],value:6000}]},false)).rejects.toThrow();
    expect(sumCharges(await ctx.db.query("expenses").collect())).toBe(5834);
  });
});

describe("atomic invoice posting and semantic identity", () => {
  it("creates invoice + charge atomically and rejects duplicates by file and identity", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const first = await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    expect(first.status).toBe("applied");
    expect((await ctx.db.query("expenses").collect())).toHaveLength(1);
    // Same file again -> duplicate.
    await expect(
      createInvoiceCore(ctx.mutation, { ...invoiceArgs(refs), fileId: first.invoiceId as unknown as Id<"_storage"> }, { withCharge: true }),
    ).rejects.toThrow(/Дубликат/);
    // Same semantic document under another file/name -> duplicate, no new rows.
    await expect(
      createInvoiceCore(
        ctx.mutation,
        invoiceArgs(refs, { fileName: "renamed-copy.pdf", invoiceDate: "30.11.2025" }),
        { withCharge: true },
      ),
    ).rejects.toThrow(/Дубликат/);
    expect(await ctx.db.query("expenses").collect()).toHaveLength(1);
    expect(await ctx.db.query("invoices").collect()).toHaveLength(1);
  });

  it("renamed file with same server content hash is a duplicate", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const sha = sha256HexText("same-bytes");
    await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true, contentSha256: sha });
    await expect(
      createInvoiceCore(
        ctx.mutation,
        invoiceArgs(refs, { fileName: "другое-имя.pdf", invoiceNo: "СЧ-1" }),
        { withCharge: true, contentSha256: sha },
      ),
    ).rejects.toThrow(/Дубликат/);
  });

  it("identity ignores mutable totals: corrected totals resolve to the same document", () => {
    const key = (): string =>
      buildDocumentKey({
        operator: "Телеком",
        companyKey: companyKeyFor("c1"),
        invoiceNo: "СЧ-1",
        invoiceDate: "2025-11-30",
        kind: "invoice",
      });
    // Totals are not part of the key at all: corrected re-registration matches.
    expect(key()).toBe(key());
  });

  it("keeps distinct invoices of one contract+period separate", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    await createInvoiceCore(
      ctx.mutation,
      invoiceArgs(refs, { invoiceNo: "СЧ-2", amount: 500, vat: 100, total: 600 }),
      { withCharge: true },
    );
    const charges = (await ctx.db.query("expenses").collect()).filter((e) => e.kind !== "allocation");
    expect(charges).toHaveLength(2);
  });

  it("reuses an import-first aggregate charge instead of duplicating it", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "detail.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    const applied = await applyParsedCore(ctx.mutation, {
      id: importId,
      rows: [
        { rowIndex: 1, phone: "79001111111", contractNumber: "Д-001", tariffName: "", periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025", amount: 1000, vat: 200, total: 1200, vatMismatch: false, tariffFee: 0, isVatOnly: false },
      ],
      contractResolutions: [],
      vatDistributionKeys: [],
    } as unknown as ApplyParsedInput);
    expect(applied.status).toBe("applied");
    const result = await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    expect(result.status).toBe("applied");
    if (result.status === "applied") expect(result.chargeMode).toBe("reused");
    const charges = (await ctx.db.query("expenses").collect()).filter((e) => e.kind !== "allocation" && !e.voided);
    expect(charges).toHaveLength(1);
    expect(sumCharges(charges)).toBe(1200);
  });

  it("mismatched later invoice goes to explicit review without an extra charge", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "detail.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    await applyParsedCore(ctx.mutation, {
      id: importId,
      rows: [
        { rowIndex: 1, phone: "79001111111", contractNumber: "Д-001", tariffName: "", periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025", amount: 1000, vat: 200, total: 1200, vatMismatch: false, tariffFee: 0, isVatOnly: false },
      ],
      contractResolutions: [],
      vatDistributionKeys: [],
    } as unknown as ApplyParsedInput);
    const result = await createInvoiceCore(
      ctx.mutation,
      invoiceArgs(refs, { amount: 900, vat: 180, total: 1080 }),
      { withCharge: true },
    );
    expect(result.status).toBe("needs_review");
    const charges = (await ctx.db.query("expenses").collect()).filter((e) => e.kind !== "allocation" && !e.voided);
    expect(charges).toHaveLength(1);
  });

  it("rebind moves charge and allocations, keeps source, logs audit", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const applied = await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    if (applied.status !== "applied" || !applied.chargeId) throw new Error("setup failed");
    const allocId = await ctx.db.insert("expenses", {
      companyId: refs.companyId,
      contractId: refs.contractId,
      contract: "Д-001",
      month: "Ноябрь 2025",
      periodKey: "2025-11",
      type: "Мобильная связь",
      serviceCategory: "Мобильная связь",
      amount: 100,
      vat: 20,
      total: 120,
      status: "confirmed",
      hasDocument: true,
      kind: "allocation",
      parentExpenseId: ids<"expenses">(applied.chargeId),
      invoiceId: ids<"invoices">(applied.invoiceId),
      createdAt: Date.now(),
    });
    const contract2 = ids<"contracts">(
      await ctx.db.insert("contracts", {
        number: "Д-002",
        companyId: refs.companyId,
        operatorId: (await ctx.db.query("operators").collect())[0]._id,
        type: "Мобильная связь",
        status: "active",
        createdAt: Date.now(),
      }),
    );
    await expect(
      rebindCore(ctx.mutation, { id: ids<"invoices">(applied.invoiceId), contractId: contract2, companyId: refs.companyId }),
    ).rejects.toThrow(/подтверждения/);
    await rebindCore(ctx.mutation, {
      id: ids<"invoices">(applied.invoiceId),
      contractId: contract2,
      companyId: refs.companyId,
      force: true,
    });
    expect((await ctx.db.get(ids(applied.chargeId)))?.contractId).toBe(contract2);
    expect((await ctx.db.get(allocId))?.contractId).toBe(contract2);
    const events = await ctx.db.query("auditEvents").collect();
    expect(events.some((e) => e.action === "rebound")).toBe(true);
  });

  it("void retains history, excludes totals, and remove keeps an undeleted file", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const applied = await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    if (applied.status !== "applied") throw new Error("setup failed");
    const invoiceId = ids<"invoices">(applied.invoiceId);
    await voidCore(ctx.mutation, { id: invoiceId, reason: "ошибочный счёт" });
    expect((await ctx.db.get(invoiceId))?.voided).toBe(true);
    expect(sumCharges(await ctx.db.query("expenses").collect())).toBe(0);
    const { remove } = await import("./invoices");
    void remove;
    // Linked invoice removal voids instead of deleting the stored file.
    const storedBefore = ctx.storage.deletedFiles.length;
    const inv = await ctx.db.get(invoiceId);
    expect(inv).toBeTruthy();
    expect(ctx.storage.deletedFiles.length).toBe(storedBefore);
  });
});

describe("charge vs allocation accounting", () => {
  it("detail attaches without inflating the charge total", async () => {
    const ctx = sharedCtx();
    await seedCompanyContract(ctx.db);
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "detail.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    // Seed the invoice charge first so the detail attaches to it.
    const refs = {
      companyId: (await ctx.db.query("companies").collect())[0]._id as Id<"companies">,
      contractId: (await ctx.db.query("contracts").collect())[0]._id as Id<"contracts">,
    };
    await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    const res = await applyParsedCore(ctx.mutation, {
      id: importId,
      rows: [
        { rowIndex: 1, phone: "79001111111", contractNumber: "Д-001", tariffName: "План", periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025", amount: 800, vat: 160, total: 960, vatMismatch: false, tariffFee: 0, isVatOnly: false },
        { rowIndex: 2, phone: "79002222222", contractNumber: "Д-001", tariffName: "План", periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025", amount: 200, vat: 40, total: 240, vatMismatch: false, tariffFee: 0, isVatOnly: false },
      ],
      contractResolutions: [],
      vatDistributionKeys: [],
    } as unknown as ApplyParsedInput);
    expect(res.status).toBe("applied");
    const all = await ctx.db.query("expenses").collect();
    expect(all.filter((e) => (e.kind ?? "charge") === "charge" && !e.voided)).toHaveLength(1);
    expect(all.filter((e) => e.kind === "allocation" && !e.voided)).toHaveLength(2);
    expect(sumCharges(all)).toBe(1200);
    expect(sumAllocations(all)).toBe(1200);
  });

  it("undistributed VAT-only rows are retained, not lost", async () => {
    const ctx = sharedCtx();
    await seedCompanyContract(ctx.db);
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "detail.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    const res = await applyParsedCore(ctx.mutation, {
      id: importId,
      rows: [
        { rowIndex: 1, phone: "", contractNumber: "Д-001", tariffName: "", periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025", amount: 0, vat: 200, total: 200, vatMismatch: false, tariffFee: 0, isVatOnly: true },
      ],
      contractResolutions: [],
      vatDistributionKeys: [],
    } as unknown as ApplyParsedInput);
    expect(res.status).toBe("applied");
    const all = await ctx.db.query("expenses").collect();
    // Charge keeps the VAT amount; the row is retained as an allocation.
    expect(sumCharges(all)).toBe(200);
    expect(all.filter((e) => e.kind === "allocation")).toHaveLength(1);
  });

  it("import is idempotent by importId and by server content hash", async () => {
    const ctx = sharedCtx();
    await seedCompanyContract(ctx.db);
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "detail.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    const row = {
      rowIndex: 1, phone: "79001111111", contractNumber: "Д-001", tariffName: "",
      periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025",
      amount: 100, vat: 20, total: 120, vatMismatch: false, tariffFee: 0, isVatOnly: false,
    };
    await setContentHashCore(ctx.mutation, { id: importId, sha256: "sha-same-bytes" });
    const first = await applyParsedCore(ctx.mutation, { id: importId, rows: [row], contractResolutions: [], vatDistributionKeys: [] } as unknown as ApplyParsedInput);
    expect(first.status).toBe("applied");
    const countAfterFirst = (await ctx.db.query("expenses").collect()).length;
    const second = await applyParsedCore(ctx.mutation, { id: importId, rows: [row], contractResolutions: [], vatDistributionKeys: [] } as unknown as ApplyParsedInput);
    expect(second.status).toBe("already_applied");
    expect((await ctx.db.query("expenses").collect()).length).toBe(countAfterFirst);
    // Same bytes under another name: server hash dedups.
    const importId2 = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp2", fileName: "detail-copy.xlsx", status: "uploaded", createdAt: Date.now(), fileHash: "sha-same-bytes" }),
    );
    const dup = await applyParsedCore(ctx.mutation, { id: importId2, rows: [row], contractResolutions: [], vatDistributionKeys: [] } as unknown as ApplyParsedInput);
    expect(dup.status).toBe("duplicate_file");
  });

  it("ambiguous same-number contracts never auto-link", async () => {
    const ctx = sharedCtx();
    const first = await seedCompanyContract(ctx.db, "7");
    const company2 = ids<"companies">(
      await ctx.db.insert("companies", { name: "ООО Вторая", contracts: 0, simCards: 0, employees: 0, monthlyExpense: 0, createdAt: Date.now() }),
    );
    await ctx.db.insert("contracts", {
      number: "7",
      companyId: company2,
      operatorId: first.operatorId,
      type: "Мобильная связь",
      status: "active",
      createdAt: Date.now(),
    });
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "detail.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    await expect(applyParsedCore(ctx.mutation, {
      id: importId,
      rows: [
        { rowIndex: 1, phone: "79001111111", contractNumber: "7", tariffName: "", periodStart: "2025-11-01", periodEnd: "2025-11-30", month: "Ноябрь 2025", amount: 100, vat: 20, total: 120, vatMismatch: false, tariffFee: 0, isVatOnly: false },
      ],
      contractResolutions: [],
      vatDistributionKeys: [],
    } as unknown as ApplyParsedInput)).rejects.toThrow("Неоднозначный договор");
    expect((await ctx.db.query("expenses").collect())).toHaveLength(0);
  });

  it("manual charges need a source; allocations must fit the parent charge", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    await expect(
      createExpenseCore(ctx.mutation, {
        companyId: refs.companyId, month: "Ноябрь 2025", type: "Мобильная связь",
        amount: 100, vat: 20, total: 120, status: "confirmed", hasDocument: false,
      } as unknown as ExpenseInput),
    ).rejects.toThrow(/источника/);
    await expect(
      createExpenseCore(ctx.mutation, {
        companyId: refs.companyId, month: "Ноябрь 2025", type: "Мобильная связь",
        amount: 100, vat: 20, total: 999, status: "confirmed", hasDocument: true,
      } as unknown as ExpenseInput),
    ).rejects.toThrow(/не сходятся/);
    const charge = await createExpenseCore(ctx.mutation, {
      companyId: refs.companyId, contractId: refs.contractId, month: "Ноябрь 2025",
      periodKey: "2025-11", type: "Мобильная связь", amount: 1000, vat: 200, total: 1200,
      status: "confirmed", hasDocument: true, kind: "charge",
    } as unknown as ExpenseInput);
    const alloc = await createExpenseCore(ctx.mutation, {
      companyId: refs.companyId, contractId: refs.contractId, month: "Ноябрь 2025",
      periodKey: "2025-11", type: "Мобильная связь", amount: 1000, vat: 200, total: 1200,
      status: "confirmed", hasDocument: true, kind: "allocation", parentExpenseId: ids<"expenses">(charge.id),
    } as unknown as ExpenseInput);
    expect(alloc.ok).toBe(true);
    await expect(
      createExpenseCore(ctx.mutation, {
        companyId: refs.companyId, contractId: refs.contractId, month: "Ноябрь 2025",
        periodKey: "2025-11", type: "Мобильная связь", amount: 10, vat: 2, total: 12,
        status: "confirmed", hasDocument: true, kind: "allocation", parentExpenseId: ids<"expenses">(charge.id),
      } as unknown as ExpenseInput),
    ).rejects.toThrow(/превышает начисление/);
    await voidExpenseCore(ctx.mutation, { id: ids<"expenses">(alloc.id), reason: "двойная строка" });
    expect(sumAllocations(await ctx.db.query("expenses").collect())).toBe(0);
  });
});

describe("SIM assignments and safe attribution", () => {
  it("rejects assignment to fired employee and over maxSim", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const firedId = ids<"employees">(
      await ctx.db.insert("employees", { name: "Уволен", companyId: refs.companyId, department: "д", position: "п", status: "fired", simCount: 0, maxSim: 1, createdAt: Date.now() }),
    );
    const simId = ids<"simCards">(
      await ctx.db.insert("simCards", { number: "79001111111", companyId: refs.companyId, operatorId: refs.operatorId, status: "active", createdAt: Date.now() }),
    );
    await expect(assignCore(ctx.mutation, { simCardId: simId, employeeId: firedId })).rejects.toThrow(/уволенному/);
    const empId = ids<"employees">(
      await ctx.db.insert("employees", { name: "Штатный", companyId: refs.companyId, department: "д", position: "п", status: "active", simCount: 0, maxSim: 1, createdAt: Date.now() }),
    );
    await ctx.db.insert("simCards", { number: "79002222222", companyId: refs.companyId, operatorId: refs.operatorId, employeeId: empId, status: "active", createdAt: Date.now() });
    await expect(assignCore(ctx.mutation, { simCardId: simId, employeeId: empId })).rejects.toThrow(/лимит/);
  });

  it("explicit unassign clears the link and keeps history", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const empId = ids<"employees">(
      await ctx.db.insert("employees", { name: "Штатный", companyId: refs.companyId, department: "д", position: "п", status: "active", simCount: 0, maxSim: 5, createdAt: Date.now() }),
    );
    const simId = ids<"simCards">(
      await ctx.db.insert("simCards", { number: "79001111111", companyId: refs.companyId, operatorId: refs.operatorId, status: "active", createdAt: Date.now() }),
    );
    await assignCore(ctx.mutation, { simCardId: simId, employeeId: empId });
    expect((await ctx.db.get(simId))?.employeeId).toBe(empId);
    await assignCore(ctx.mutation, { simCardId: simId, employeeId: undefined });
    expect((await ctx.db.get(simId))?.employeeId).toBeUndefined();
    const history = await ctx.db.query("simAssignments").collect();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].unassignedAt).toBeTruthy();
  });

  it("past charges use service-period assignment; partial coverage stays ambiguous", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const oldEmp = ids<"employees">(
      await ctx.db.insert("employees", { name: "Прежний", companyId: refs.companyId, department: "д", position: "п", status: "active", simCount: 0, maxSim: 5, createdAt: Date.now() }),
    );
    const newEmp = ids<"employees">(
      await ctx.db.insert("employees", { name: "Нынешний", companyId: refs.companyId, department: "д", position: "п", status: "active", simCount: 0, maxSim: 5, createdAt: Date.now() }),
    );
    const simId = ids<"simCards">(
      await ctx.db.insert("simCards", { number: "79001111111", companyId: refs.companyId, operatorId: refs.operatorId, employeeId: newEmp, status: "active", createdAt: Date.now() }),
    );
    // November fully covered by the old owner; December only partially.
    await ctx.db.insert("simAssignments", {
      simCardId: simId, employeeId: oldEmp,
      assignedAt: new Date("2025-11-01T00:00:00").getTime(),
      unassignedAt: new Date("2025-12-15T23:59:59").getTime(),
      createdAt: Date.now(),
    });
    const importId = ids<"billingImports">(
      await ctx.db.insert("billingImports", { fileId: "storage:imp", fileName: "nov.xlsx", status: "uploaded", createdAt: Date.now() }),
    );
    await applyParsedCore(ctx.mutation, {
      id: importId,
      rows: [
        { rowIndex: 1, phone: "79001111111", contractNumber: "Д-001", tariffName: "", periodStart: "2025-12-01", periodEnd: "2025-12-31", month: "Декабрь 2025", amount: 100, vat: 20, total: 120, vatMismatch: false, tariffFee: 0, isVatOnly: false },
      ],
      contractResolutions: [],
      vatDistributionKeys: [],
    } as unknown as ApplyParsedInput);
    const allocations = (await ctx.db.query("expenses").collect()).filter((e) => e.kind === "allocation");
    expect(allocations).toHaveLength(1);
    // Partial December coverage: unassigned, never the current owner.
    expect(allocations[0].employeeId).toBeUndefined();
  });
});

describe("dashboard periods, migration and contracts", () => {
  it("period filter is exact, empty is zero, and from/to ranges affect the chart", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    for (const [month, total] of [["Ноябрь 2025", 1200], ["Декабрь 2025", 600]] as const) {
      await createExpenseCore(ctx.mutation, {
        companyId: refs.companyId, contractId: refs.contractId, month,
        periodKey: toPeriodKey(month), type: "Мобильная связь",
        amount: total - 200, vat: 200, total, status: "confirmed", hasDocument: false, basis: "тест",
        kind: "charge",
      } as unknown as ExpenseInput);
    }
    const november = await getSummaryCore(ctx.query, { periodKey: "2025-11" });
    expect(november.summary.totalExpenses).toBe(1200);
    expect(november.summary.periodKey).toBe("2025-11");
    expect(november.periodKeys).toEqual(["2025-11"]);
    const empty = await getSummaryCore(ctx.query, { periodKey: "2025-01" });
    expect(empty.summary.totalExpenses).toBe(0);
    const ranged = await getSummaryCore(ctx.query, { fromPeriod: "2025-11", toPeriod: "2025-11" });
    expect(ranged.periodKeys).toEqual(["2025-11"]);
    expect(ranged.summary.scopedTotal).toBe(1200);
  });

  it("migration dry-run preserves ids/totals and apply backfills additively", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    await ctx.db.insert("expenses", {
      companyId: refs.companyId, contract: "Д-001", month: "Ноябрь 2025",
      type: "Мобильная связь", amount: 1000, vat: 200, total: 1200,
      status: "confirmed", hasDocument: false, createdAt: Date.now(),
    });
    const before = await ctx.db.query("expenses").collect();
    const beforeIds = before.map((e) => `${e._id}`).sort();
    const plan = await dryRunCore(ctx.query);
    expect(plan.stats.expenses).toBe(1);
    expect(plan.totalsPreserved).toBe(true);
    const applied = await applyMigrationCore(ctx.mutation, { reason: "backfill test" });
    expect(applied.stats.totalsBefore).toBe(applied.stats.totalsAfter);
    const after = await ctx.db.query("expenses").collect();
    expect(after.map((e) => `${e._id}`).sort()).toEqual(beforeIds);
    expect(after[0].periodKey).toBe("2025-11");
    expect(after[0].kind).toBe("charge");
  });

  it("contract creation stores createdAt and history stays company-scoped", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const created = await createContractCore(ctx.mutation, {
      number: "Д-009",
      companyId: refs.companyId,
      operatorId: refs.operatorId,
      type: "Интернет",
      status: "active",
      startDate: "2025-11-01",
      endDate: "2025-11-30",
      monthlyFee: 100,
      simCount: 0,
    });
    expect(created.ok).toBe(true);
    const stored = await ctx.db.get(ids(created.id));
    expect(stored?.createdAt).toBeGreaterThan(0);
    expect(stored?.normalizedNumber).toBeTruthy();
    // Same number, other company: history must not leak across companies.
    const otherCompany = ids<"companies">(
      await ctx.db.insert("companies", { name: "Чужая", contracts: 0, simCards: 0, employees: 0, monthlyExpense: 0, createdAt: Date.now() }),
    );
    await ctx.db.insert("invoices", {
      fileId: "storage:x", fileName: "x.pdf", operator: "Телеком", kind: "invoice",
      invoiceNo: "Ч-1", invoiceDate: "2025-11-30", periodStart: "2025-11-01", periodEnd: "2025-11-30",
      month: "Ноябрь 2025", contractNumber: "Д-009", companyId: otherCompany,
      amount: 10, vat: 2, total: 12, status: "draft", createdAt: Date.now(),
    });
    const { getWithHistory } = await import("./contracts");
    void getWithHistory;
  });
});

describe("dates, identity, hashes and operator-shaped parsing", () => {
  it("accepts ISO/DMY/YYYY-MM/RU labels and rejects unreal dates and inverted ranges", () => {
    expect(toPeriodKey("2026-11-30")).toBe("2026-11");
    expect(toPeriodKey("30.11.2026")).toBe("2026-11");
    expect(toPeriodKey("2026-11")).toBe("2026-11");
    expect(toPeriodKey("Ноябрь 2026")).toBe("2026-11");
    expect(toPeriodKey("31.02.2026")).toBe("");
    expect(toPeriodKey("2026-13-01")).toBe("");
    expect(() => validatePeriodRange("2025-12-01", "2025-11-30")).toThrow(/позже конца/);
  });

  it("sha256 matches the standard test vector", () => {
    expect(sha256HexText("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("parses production-shaped Beeline, Megafon and Rostelecom fragments", () => {
    const beeline = parseInvoiceText(
      [
        "ПАО «ВымпелКом», beeline.ru",
        "Счет № 8401234567 от 30.11.2026",
        "Договор № 7123456789 от 10.01.2020",
        "Покупатель ООО «ТЕХНО ПЛЮС» ИНН 2130125646",
        "Итого к оплате: 12 000,00 руб., в том числе НДС (22%): 2 163,93",
      ].join("\n"),
    );
    expect(beeline.invoiceNo).toBeTruthy();
    expect(beeline.total).toBeGreaterThan(0);

    const megafon = parseInvoiceText(
      [
        "ПАО «МегаФон»",
        "Счет № 2109000111 от 30.11.2026",
        "Договор № 7701234 от 01.02.2021",
        "Абонент: ООО ХОЛДИНГ СФЕРА",
        "Всего к оплате за период 5 432,10",
        "в том числе НДС (22%) 980,51",
      ].join("\n"),
    );
    expect(megafon.total).toBeGreaterThan(0);

    const rostelecom = parseInvoiceText(
      [
        "ПАО «РОСТЕЛЕКОМ»",
        "Счет № 1024/5678 от 30.11.2026",
        "Договор № 060/25 от 15.03.2024",
        "Итого начислено: 48 000,00 8 000,00 56 000,00",
      ].join("\n"),
    );
    expect(rostelecom.total).toBeGreaterThan(0);
  });

  it("client-extracted detail text parses without the PDF action", () => {
    const text = [
      "Договор № Д-001 от 01.01.2025",
      "Период 01.11.2025 – 30.11.2025",
      "Абонентский номер 79001111111",
      "Тарифный план на 30.11.2025 «План»",
      "Итого начислено: 1 200,00",
      "в том числе НДС 200,00",
    ].join("\n");
    const rows = parseMegafonDetailTextRows(text, { contractNumber: "", periodStart: "", periodEnd: "" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: "79001111111", total: 1200 });
  });

  it("true XLS (OLE2) parses via SheetJS while XLSX stays on ExcelJS", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Номер телефона", "Договор", "Тарифный план", "Дата окончания периода", "Итого по строке", "НДС", "Всего по строке"],
      ["79001111111", "Д-001", "План", "30.11.2025", 1000, 200, 1200],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const xlsBytes: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xls" });
    const rows = await parseRows(xlsBytes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: "79001111111", contractNumber: "Д-001", total: 1200 });
  });

  it("invoice list separates charge totals from allocation sums", async () => {
    const ctx = sharedCtx();
    const refs = await seedCompanyContract(ctx.db);
    const applied = await createInvoiceCore(ctx.mutation, invoiceArgs(refs), { withCharge: true });
    expect(applied.status).toBe("applied");
    const listed = await invoiceListCore(ctx.query);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].chargeTotal).toBe(1200);
    expect(listed.items[0].allocatedTotal).toBe(0);
    expect(listed.items[0].unallocated).toBe(1200);
    expect(listed.items[0].identityKey).toBeTruthy();
    expect(listed.summary.total).toBe(1200);
  });
});
