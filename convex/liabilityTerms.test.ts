import { describe, expect, it } from "vitest";
import { setTerms } from "./liabilities";
import { upsertLiability } from "./mobile";

// Bounded synthetic DB: the registered handlers with real auth and receipt helpers.
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  let user = "user";
  const seed = (table: string, id: string, value: object) => { rows.set(id, { _id: id, ...value }); tables.set(id, table); return id; };
  seed("users", "user", { email: "synthetic@example.com" });
  seed("users", "viewer", { email: "synthetic-viewer@example.com" });
  seed("memberships", "m1", { userId: "user", portfolioId: "pf", role: "owner" });
  seed("memberships", "m2", { userId: "viewer", portfolioId: "pf", role: "viewer" });
  seed("liabilities", "l1", { portfolioId: "pf", name: "Loan from a friend", kind: "loan", balance: 20000, currency: "EUR", counterparty: "Friend" });
  seed("liabilities", "lbtc", { portfolioId: "pf", name: "Coin loan", kind: "loan", balance: 31000, currency: "USD", owedSymbol: "BTC", owedQuantity: 0.4 });
  seed("liabilities", "l-other", { portfolioId: "other", name: "x", kind: "loan", balance: 1, currency: "EUR" });
  const db = {
    normalizeId: (table: string, id: string) => (tables.get(id) === table ? id : null),
    get: async (id: string) => (rows.has(id) ? { ...rows.get(id) } : null),
    insert: async (table: string, value: object) => seed(table, `${table}-${++sequence}`, value),
    patch: async (id: string, patch: Record<string, unknown>) => {
      const next = { ...rows.get(id) };
      // Convex removes a field patched with undefined.
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete next[k]; else next[k] = v; }
      rows.set(id, next);
    },
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      const collect = async () => [...rows].filter(([id, row]) => tables.get(id) === table && predicates.every((p) => p(row))).map(([, row]) => ({ ...row }));
      const q = {
        withIndex: (_: string, cb: any) => { const b = { eq: (k: string, v: unknown) => { predicates.push((r) => r[k] === v); return b; } }; cb(b); return q; },
        filter: (cb: any) => { predicates.push(cb({ field: (k: string) => k, eq: (k: string, v: unknown) => (r: any) => r[k] === v })); return q; },
        collect, unique: async () => (await collect())[0] ?? null, first: async () => (await collect())[0] ?? null,
      };
      return q;
    },
  };
  const ctx = { db, auth: { getUserIdentity: async () => ({ subject: user }) } } as any;
  return {
    call: (fn: any, args: object) => fn._handler(ctx, args),
    as: (id: string) => { user = id; },
    row: (id: string) => rows.get(id),
  };
}

const DAY = 86_400_000;
const NOW = Date.now();

describe("loan terms", () => {
  it("saves terms without touching the balance, once per receipt", async () => {
    const f = fixture();
    const args = { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8, dueKind: "flexible", clientMutationId: "t-1" };
    await f.call(setTerms, args);
    await f.call(setTerms, args);
    expect(f.row("l1")).toMatchObject({ balance: 20000, principal: 20000, interestTerms: "simple", interestRate: 8, dueKind: "flexible" });
  });

  it("keeps what is saved for fields left out, and clears a field with null", async () => {
    const f = fixture();
    await f.call(setTerms, { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8 });
    await f.call(setTerms, { id: "l1", interestRate: 10 });
    expect(f.row("l1")).toMatchObject({ principal: 20000, interestRate: 10, interestTerms: "simple" });
    await f.call(setTerms, { id: "l1", interestTerms: "none" });
    expect(f.row("l1").interestRate).toBeUndefined();
    expect(f.row("l1").principal).toBe(20000);
  });

  it("refuses incomplete simple interest, out-of-range rates, and terms on someone else's debt or as a viewer", async () => {
    const f = fixture();
    await expect(f.call(setTerms, { id: "l1", interestTerms: "simple", interestRate: 8 })).rejects.toThrow(/original amount/);
    await expect(f.call(setTerms, { id: "l1", interestRate: 120 })).rejects.toThrow(/between 0 and 100/);
    await expect(f.call(setTerms, { id: "l1", dueKind: "fixed" })).rejects.toThrow(/repayment date/);
    await expect(f.call(setTerms, { id: "lbtc", principal: 1000 })).rejects.toThrow(/coin/);
    f.as("viewer");
    await expect(f.call(setTerms, { id: "l1", dueKind: "flexible" })).rejects.toThrow();
    expect(f.row("l1").principal).toBeUndefined();
    expect(f.row("l1").dueKind).toBeUndefined();
  });

  it("does not wipe the saved rate when an update from Ask changes only the balance", async () => {
    const f = fixture();
    await f.call(setTerms, { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8 });
    await f.call(upsertLiability, { id: "l1", portfolioId: "pf", name: "Loan from a friend", kind: "loan", balance: 19000, currency: "EUR", counterparty: "Friend", clientMutationId: "up-1" });
    expect(f.row("l1")).toMatchObject({ balance: 19000, interestRate: 8, interestTerms: "simple", principal: 20000 });
  });
});
