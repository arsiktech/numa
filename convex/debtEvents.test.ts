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

  it("splits a payment into principal, interest and fees, and only the principal part lowers the debt", async () => {
    const f = fixture();
    const r = await f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 1000, unit: "EUR", principalPart: 800, interestPart: 150, feePart: 50, apply: true, clientMutationId: "split-1" });
    expect(f.row("l1").balance).toBe(18870);
    expect(await f.call(listForPortfolio, { portfolioId: "pf" })).toEqual([expect.objectContaining({ amount: 1000, principalPart: 800, interestPart: 150, feePart: 50, applied: true })]);
    // Undo gives back the principal only, not the whole payment.
    await f.call(remove, { id: r.id });
    expect(f.row("l1").balance).toBe(19670);
  });

  it("treats a payment of interest alone as no change to what is owed", async () => {
    const f = fixture();
    const r = await f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 200, unit: "EUR", interestPart: 200, apply: true });
    expect(f.row("l1").balance).toBe(19670);
    expect(f.events()[0]).toMatchObject({ principalPart: 0, interestPart: 200, feePart: 0 });
    await f.call(remove, { id: r.id });
    expect(f.row("l1").balance).toBe(19670);
  });

  it("keeps a split replay from taking the payment twice", async () => {
    const f = fixture();
    const args = { ...base, subject: "liability:l1", kind: "repaid", amount: 1000, unit: "EUR", principalPart: 900, interestPart: 100, apply: true, clientMutationId: "split-replay" };
    await f.call(add, args);
    await f.call(add, args);
    expect(f.row("l1").balance).toBe(18770);
    expect(f.events()).toHaveLength(1);
  });

  it("refuses a split that does not add up, a negative part, and a split on anything but a payment", async () => {
    const f = fixture();
    const bad = (args: object) => expect(f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 1000, unit: "EUR", apply: true, ...args })).rejects.toThrow();
    await bad({ principalPart: 800, interestPart: 150 });
    await bad({ principalPart: 1100, interestPart: -100 });
    await bad({ principalPart: 900, interestPart: 100.02 });
    await bad({ kind: "borrowed", principalPart: 1000 });
    await bad({ kind: "capitalized", interestPart: 1000 });
    await bad({ principalPart: 20000, interestPart: 0, amount: 20000 });
    expect(f.row("l1").balance).toBe(19670);
    expect(f.events()).toHaveLength(0);
  });

  it("accepts a split in whole cents, and keeps coin parts to eight decimals", async () => {
    const f = fixture();
    await f.call(add, { ...base, subject: "liability:l1", kind: "repaid", amount: 10, unit: "EUR", principalPart: 3.33, interestPart: 3.33, feePart: 3.34, apply: true });
    expect(f.row("l1").balance).toBe(19666.67);
    await f.call(add, { ...base, subject: "liability:lbtc", kind: "repaid", amount: 0.1, unit: "BTC", principalPart: 0.09, interestPart: 0.01, apply: true });
    expect(f.row("lbtc").owedQuantity).toBe(0.31);
  });

  it("adds unpaid interest to the principal as one event, and Undo takes it off again", async () => {
    const f = fixture();
    const r = await f.call(add, { ...base, subject: "liability:l1", kind: "capitalized", amount: 448, unit: "EUR", note: "Interest for September", apply: true, clientMutationId: "cap-1" });
    await f.call(add, { ...base, subject: "liability:l1", kind: "capitalized", amount: 448, unit: "EUR", note: "Interest for September", apply: true, clientMutationId: "cap-1" });
    expect(f.row("l1").balance).toBe(20118);
    expect(f.events()).toHaveLength(1);
    await f.call(remove, { id: r.id });
    expect(f.row("l1").balance).toBe(19670);
  });

  it("allows interest to be added only to a debt, never to money owed to you", async () => {
    const f = fixture();
    await expect(f.call(add, { ...base, subject: "asset:a1", kind: "capitalized", amount: 10, unit: "EUR", apply: true })).rejects.toThrow(/lent or received/);
    expect(f.row("a1").balance).toBe(51441.88);
  });

  it("splits money received on a loan to you the same way", async () => {
    const f = fixture();
    await f.call(add, { ...base, subject: "asset:a1", kind: "received", amount: 1000, unit: "EUR", principalPart: 900, interestPart: 100, apply: true });
    expect(f.row("a1").balance).toBe(50541.88);
  });
});
