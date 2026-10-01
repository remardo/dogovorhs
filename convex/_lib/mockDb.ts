/**
 * Minimal in-memory Convex mock for integration-style handler tests.
 * Supports db.get/insert/patch/delete + query().collect()/first()/take()
 * with equality withIndex() and a small filter() expression evaluator.
 * Storage + auth are stubbed; REQUIRE_AUTH is off in tests.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDoc = any;

type FieldRef = { __field: string };
type Expr =
  | { __op: "eq"; a: unknown; b: unknown }
  | { __op: "neq"; a: unknown; b: unknown }
  | { __op: "and"; args: Expr[] }
  | { __op: "or"; args: Expr[] };

function resolveOperand(doc: AnyDoc, operand: unknown): unknown {
  if (operand && typeof operand === "object" && "__field" in (operand as Record<string, unknown>)) {
    const field = (operand as FieldRef).__field;
    return field === "_id" ? doc._id : doc[field];
  }
  return operand;
}

function evalExpr(doc: AnyDoc, expr: Expr): boolean {
  if (expr.__op === "eq") {
    return `${resolveOperand(doc, expr.a)}` === `${resolveOperand(doc, expr.b)}`;
  }
  if (expr.__op === "neq") {
    return `${resolveOperand(doc, expr.a)}` !== `${resolveOperand(doc, expr.b)}`;
  }
  if (expr.__op === "and") return expr.args.every((a) => evalExpr(doc, a));
  return expr.args.some((a) => evalExpr(doc, a));
}

function makeQueryBuilder() {
  return {
    field: (name: string): FieldRef => ({ __field: name }),
    eq: (a: unknown, b: unknown): Expr => ({ __op: "eq", a, b }),
    neq: (a: unknown, b: unknown): Expr => ({ __op: "neq", a, b }),
    and: (...args: Expr[]): Expr => ({ __op: "and", args }),
    or: (...args: Expr[]): Expr => ({ __op: "or", args }),
  };
}

export class MockDb {
  tables = new Map<string, Map<string, AnyDoc>>();
  seq = 0;

  private table(name: string): Map<string, AnyDoc> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  all(table: string): AnyDoc[] {
    return Array.from(this.table(table).values());
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    this.seq += 1;
    const id = `${table}:${this.seq}`;
    const doc = { ...value, _id: id };
    this.table(table).set(id, doc);
    return id;
  }

  async get(id: string): Promise<AnyDoc | null> {
    for (const t of this.tables.values()) {
      const doc = t.get(id);
      if (doc) return doc;
    }
    return null;
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    for (const t of this.tables.values()) {
      const doc = t.get(id);
      if (doc) {
        t.set(id, { ...doc, ...patch });
        return;
      }
    }
    throw new Error(`Document not found: ${id}`);
  }

  async delete(id: string): Promise<void> {
    for (const t of this.tables.values()) {
      if (t.delete(id)) return;
    }
  }

  query(table: string): MockQuery {
    return new MockQuery(this, table);
  }
}

class MockQuery {
  private indexEq: Array<{ field: string; value: unknown }> = [];
  private filterExpr?: Expr;
  private takeN?: number;
  private firstOnly = false;

  constructor(private db: MockDb, private table: string) {}

  withIndex(_name: string, fn?: (q: { eq: (field: string, value: unknown) => void }) => void): this {
    if (fn) {
      const collector: Array<{ field: string; value: unknown }> = [];
      fn({ eq: (field, value) => { collector.push({ field, value }); } });
      this.indexEq = collector;
    }
    return this;
  }

  filter(fn: (q: ReturnType<typeof makeQueryBuilder>) => Expr): this {
    this.filterExpr = fn(makeQueryBuilder());
    return this;
  }

  order(direction?: "asc" | "desc"): this {
    void direction; return this;
  }

  take(n: number): MockQuery {
    this.takeN = n;
    return this;
  }

  private apply(): AnyDoc[] {
    let docs = this.db.all(this.table);
    if (this.indexEq.length) {
      docs = docs.filter((d) =>
        this.indexEq.every((c) => `${c.field === "_id" ? d._id : d[c.field]}` === `${c.value}`),
      );
    }
    if (this.filterExpr) {
      const expr = this.filterExpr;
      docs = docs.filter((d) => evalExpr(d, expr));
    }
    if (this.takeN !== undefined) docs = docs.slice(0, this.takeN);
    if (this.firstOnly) docs = docs.slice(0, 1);
    return docs;
  }

  async collect(): Promise<AnyDoc[]> {
    return this.apply();
  }

  async first(): Promise<AnyDoc | null> {
    this.firstOnly = true;
    const docs = this.apply();
    return docs[0] ?? null;
  }
}

export function mockStorage() {
  const files = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  return {
    getUrl: async (id: string) => `https://storage.local/${id}`,
    get: async (id: string) => {
      const bytes = files.get(id);
      if (!bytes) return null;
      const copy = bytes.slice();
      return new Blob([copy as BlobPart]);
    },
    delete: async (id: string) => {
      deleted.push(id);
      files.delete(id);
    },
    generateUploadUrl: async () => "https://storage.local/upload",
    putFile: (id: string, bytes: Uint8Array) => {
      files.set(id, bytes);
    },
    deletedFiles: deleted,
  };
}

export function mockCtx(db?: MockDb) {
  const database = db ?? new MockDb();
  return { db: database, storage: mockStorage() };
}

export type MockCtx = ReturnType<typeof mockCtx>;

/** Single boundary cast from the in-memory mock to a Convex mutation ctx. */
export function asMutationCtx(db?: MockDb): import("../_generated/server").MutationCtx {
  return mockCtx(db) as unknown as import("../_generated/server").MutationCtx;
}

/** Single boundary cast from the in-memory mock to a Convex query ctx. */
export function asQueryCtx(db?: MockDb): import("../_generated/server").QueryCtx {
  return mockCtx(db) as unknown as import("../_generated/server").QueryCtx;
}

/** Same mock db exposed as both ctx flavors (shares storage file registry). */
export function sharedCtx(db?: MockDb): {
  db: MockDb;
  mutation: import("../_generated/server").MutationCtx;
  query: import("../_generated/server").QueryCtx;
  storage: ReturnType<typeof mockStorage>;
} {
  const database = db ?? new MockDb();
  const storage = mockStorage();
  const base = { db: database, storage };
  return {
    db: database,
    mutation: base as unknown as import("../_generated/server").MutationCtx,
    query: base as unknown as import("../_generated/server").QueryCtx,
    storage,
  };
}

export async function seedCompanyContract(db: MockDb, overrides?: Partial<{ companyName: string }>) {
  const now = Date.now();
  const companyId = await db.insert("companies", {
    name: overrides?.companyName ?? "ООО Тест",
    contracts: 0, simCards: 0, employees: 0, monthlyExpense: 0, createdAt: now,
  });
  const operatorId = await db.insert("operators", {
    name: "Телеком", contracts: 0, simCards: 0, createdAt: now,
  });
  const contractId = await db.insert("contracts", {
    number: "Д-001",
    companyId,
    operatorId,
    type: "Мобильная связь",
    serviceCategory: "Мобильная связь",
    normalizedNumber: "Д001",
    status: "active",
    createdAt: now,
  });
  return { companyId, operatorId, contractId };
}
