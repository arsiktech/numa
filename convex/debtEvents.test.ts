import { describe, expect, it } from "vitest";
import { add, listForPortfolio, remove } from "./debtEvents";

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
  seed("liabilities", "l1", { portfolioId: "pf", name: "Stas", balance: 19670, currency: "EUR" });
  seed("liabilities", "lbtc", { portfolioId: "pf", name: "Parents", balance: 31000, currency: "USD", owedSymbol: "BTC", owedQuantity: 0.4 });
  seed("assets", "a1", { portfolioId: "pf", name: "Loan to company", balance: 51441.88, currency: "EUR", owedBy: "XCHAINGER" });
  seed("assets", "a2", { portfolioId: "pf", name: "Cash", balance: 100, currency: "EUR" });
  seed("liabilities", "l-other", { portfolioId: "other", name: "x", balance: 1, currency: "EUR" });
  const db = {
    normalizeId: (table: string, id: string) => (tables.get(id) === table ? id : null),
    get: async (id: string) => (rows.has(id) ? { ...rows.get(id) } : null),
    insert: async (table: string, value: object) => seed(table, `${table}-${++sequence}`, value),
    patch: async (id: string, patch: object) => { rows.set(id, { ...rows.get(id), ...patch }); },
    delete: async (id: string) => { rows.delete(id); tables.delete(id); },
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
    events: () => [...rows].filter(([id]) => tables.get(id) === "debtEvents").map(([, r]) => r),
  };
}

const NOW = Date.now();
const base = { portfolioId: "pf", occurredAt: NOW - 86_400_000 };

describe("debt history", () => {
  it("records a payment that lowers the debt, once per receipt, and Undo gives it back", async () => {
    const f = fixture();
    const r = await f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 5000, unit: "EUR", note: "Paid to Liza via Zen", apply: true, clientMutationId: "pay-1" });
    await f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 5000, unit: "EUR", note: "Paid to Liza via Zen", apply: true, clientMutationId: "pay-1" });
    expect(f.row("l1").balance).toBe(14670);
    expect(await f.call(listForPortfolio, { portfolioId: "pf" })).toEqual([expect.objectContaining({ subject: "liability:l1", kind: "repaid", amount: 5000, unit: "EUR", applied: true, note: "Paid to Liza via Zen" })]);
    await f.call(remove, { id: r.id });
    expect(f.row("l1").balance).toBe(19670);
    expect(f.events()).toHaveLength(0);
  });

  it("keeps history-only entries out of the balance, and moves a coin debt in its coin at its last price", async () => {
    const f = fixture();
    await f.call(add, { ...base, subject: "liability:l1", kind: "borrowed", amount: 24670, unit: "EUR", apply: false });
    expect(f.row("l1").balance).toBe(19670);
    await f.call(add, { ...base, subject: "liability:lbtc", kind: "repaid", amount: 0.1, unit: "btc", apply: true });
    expect(f.row("lbtc")).toMatchObject({ owedQuantity: 0.3, balance: 23250 });
  });

  it("takes money back on money owed to you, and only on records marked with who owes it", async () => {
    const f = fixture();
    await f.call(add, { ...base, subject: "asset:a1", kind: "received", amount: 1441.88, unit: "EUR", apply: true });
    expect(f.row("a1").balance).toBe(50000);
    await expect(f.call(add, { ...base, subject: "asset:a2", kind: "received", amount: 1, unit: "EUR", apply: true })).rejects.toThrow(/who owes/);
    await expect(f.call(add, { ...base, subject: "asset:a1", kind: "repaid", amount: 1, unit: "EUR", apply: true })).rejects.toThrow(/lent or received/);
  });

  it("refuses the wrong unit, paying back more than is owed, future dates, empty notes, other spaces and viewers", async () => {
    const f = fixture();
    const bad = (args: object) => expect(f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 10, unit: "EUR", apply: true, ...args })).rejects.toThrow();
    await bad({ unit: "USD" });
    await bad({ subject: "liability:lbtc", unit: "USD" });
    await bad({ amount: 20000 });
    await bad({ amount: -1 });
    await bad({ occurredAt: NOW + 3 * 86_400_000 });
    await bad({ kind: "note", amount: undefined, unit: undefined, apply: false });
    await bad({ subject: "liability:l-other" });
    f.as("viewer");
    await bad({});
    expect(f.row("l1").balance).toBe(19670);
    expect(f.events()).toHaveLength(0);
  });
});
