import { describe, expect, it } from "vitest";
import { setTerms, update } from "./liabilities";
import { deleteLiability, upsertLiability } from "./mobile";
import { debtFields, deletePlan, editPlan } from "../apps/numa/src/data/editPlan";
import type { CloudLiability } from "../apps/numa/src/cloud/api";

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
  seed("liabilities", "lmort", { portfolioId: "pf", name: "Mortgage", kind: "mortgage", balance: 90000, currency: "EUR" });
  seed("liabilities", "lfixed", { portfolioId: "pf", name: "Fixed loan", kind: "loan", balance: 5000, currency: "EUR", dueKind: "fixed", dueDate: Date.now() + 90 * 86_400_000, counterparty: "Sam" });
  seed("liabilities", "llegacy", { portfolioId: "pf", name: "Old loan", kind: "loan", balance: 3000, currency: "EUR", dueDate: Date.now() + 30 * 86_400_000, interestRate: 8 });
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
    notes: () => [...rows].filter(([id]) => tables.get(id) === "debtEvents").map(([, row]) => row),
    seed,
  };
}

const DAY = 86_400_000;
const NOW = Date.now();

describe("loan terms", () => {
  const snapshot = (f: ReturnType<typeof fixture>, id: string): CloudLiability => ({ ...f.row(id), id, dueDate: f.row(id).dueDate ?? null });

  it("executes a clear-date edit and Undo through the registered upsert, restoring the fixed kind", async () => {
    const f = fixture();
    const before = debtFields(snapshot(f, "lfixed"));
    const plan = editPlan("liability", "lfixed", before, { ...before, dueDate: null }, "pf");
    await f.call(upsertLiability, plan.apply.args);
    expect(f.row("lfixed").dueKind).toBeUndefined();
    await f.call(upsertLiability, plan.undo.args);
    expect(f.row("lfixed")).toMatchObject({ dueKind: "fixed", dueDate: before.dueDate });
  });

  it("executes delete and Undo with the full saved terms, retaining history on its original subject", async () => {
    const f = fixture();
    const saved = { principal: 20_000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8, interestDueDay: 10, dueKind: "fixed", dueDate: NOW + 90 * DAY };
    await f.call(setTerms, { id: "l1", ...saved });
    f.seed("debtEvents", "old-event", { portfolioId: "pf", subject: "liability:l1", kind: "note", note: "Synthetic retained history", occurredAt: NOW, applied: false });
    const plan = deletePlan("liability", "l1", debtFields(snapshot(f, "l1")), "pf");
    await f.call(deleteLiability, plan.apply.args);
    const restored = await f.call(upsertLiability, plan.undo.args);
    expect(f.row(restored.id)).toMatchObject({ ...saved, balance: 20_000, currency: "EUR", counterparty: "Friend" });
    expect(restored.id).not.toBe("l1");
    expect(f.row("old-event")).toMatchObject({ subject: "liability:l1", note: "Synthetic retained history" });
  });

  it("validates restored terms on the create path rather than admitting malformed simple loans", async () => {
    const f = fixture();
    await expect(f.call(upsertLiability, { portfolioId: "pf", name: "Invalid restore", kind: "loan", balance: 100, currency: "EUR", interestTerms: "simple", interestRate: 8 })).rejects.toThrow(/original amount/);
  });
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

  it("keeps a fixed loan's repayment date when an update leaves it out, so it never ends up fixed with no date", async () => {
    const f = fixture();
    const date = f.row("lfixed").dueDate;
    await f.call(upsertLiability, { id: "lfixed", portfolioId: "pf", name: "Fixed loan", kind: "loan", balance: 4000, currency: "EUR", counterparty: "Sam" });
    expect(f.row("lfixed")).toMatchObject({ balance: 4000, dueKind: "fixed", dueDate: date });
  });

  it("still lets an update change the date of a fixed loan, and treats a legacy debt as before", async () => {
    const f = fixture();
    const later = Date.now() + 200 * 86_400_000;
    await f.call(upsertLiability, { id: "lfixed", portfolioId: "pf", name: "Fixed loan", kind: "loan", balance: 5000, currency: "EUR", dueDate: later });
    expect(f.row("lfixed").dueDate).toBe(later);
    await f.call(upsertLiability, { id: "llegacy", portfolioId: "pf", name: "Old loan", kind: "loan", balance: 2900, currency: "EUR" });
    expect(f.row("llegacy").dueDate).toBeUndefined();
    expect(f.row("llegacy").interestRate).toBe(8);
  });

  it("clears a fixed loan's repayment date, and its fixed kind, when an update says null, and an update that leaves it out still keeps it", async () => {
    const f = fixture();
    const date = f.row("lfixed").dueDate;
    const update = (extra: object) => f.call(upsertLiability, { id: "lfixed", portfolioId: "pf", name: "Fixed loan", kind: "loan", balance: 5000, currency: "EUR", counterparty: "Sam", ...extra });
    await update({});
    expect(f.row("lfixed")).toMatchObject({ dueKind: "fixed", dueDate: date });
    await update({ dueDate: null });
    expect(f.row("lfixed").dueDate).toBeUndefined();
    expect(f.row("lfixed").dueKind).toBeUndefined();
    expect(f.row("lfixed")).toMatchObject({ balance: 5000, counterparty: "Sam" });
    // With no date and no kind left, a later update that leaves the date out has nothing to keep.
    await update({ balance: 4900 });
    expect(f.row("lfixed")).toMatchObject({ balance: 4900 });
    expect(f.row("lfixed").dueDate).toBeUndefined();
  });

  it("clears the date of a debt with no loan terms when an update says null, and creates a debt with a null date", async () => {
    const f = fixture();
    await f.call(upsertLiability, { id: "llegacy", portfolioId: "pf", name: "Old loan", kind: "loan", balance: 3000, currency: "EUR", dueDate: null });
    expect(f.row("llegacy").dueDate).toBeUndefined();
    const created = await f.call(upsertLiability, { portfolioId: "pf", name: "New", kind: "loan", balance: 10, currency: "EUR", dueDate: null });
    expect(f.row(created.id)).toMatchObject({ name: "New", balance: 10 });
    expect(f.row(created.id).dueDate).toBeUndefined();
  });

  it("takes the repayment date away with a repayment kind set to not set, and leaves a date given with it alone", async () => {
    const f = fixture();
    await f.call(setTerms, { id: "lfixed", dueKind: null });
    expect(f.row("lfixed").dueKind).toBeUndefined();
    expect(f.row("lfixed").dueDate).toBeUndefined();
    const date = Date.now() + 60 * 86_400_000;
    await f.call(setTerms, { id: "lfixed", dueKind: "fixed", dueDate: date });
    expect(f.row("lfixed")).toMatchObject({ dueKind: "fixed", dueDate: date });
  });

  it("refuses to turn a debt with loan terms into one owed in a coin, and changes nothing", async () => {
    const f = fixture();
    await f.call(setTerms, { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8 });
    await expect(f.call(upsertLiability, { id: "l1", portfolioId: "pf", name: "Loan from a friend", kind: "loan", balance: 20000, currency: "EUR", owedSymbol: "BTC", owedQuantity: 0.4 })).rejects.toThrow(/owed in a coin/);
    expect(f.row("l1")).toMatchObject({ balance: 20000, principal: 20000, interestTerms: "simple" });
    expect(f.row("l1").owedSymbol).toBeUndefined();
  });

  it("keeps simple interest off a mortgage and says why", async () => {
    const f = fixture();
    await expect(f.call(setTerms, { id: "lmort", principal: 90000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 4 })).rejects.toThrow(/compound or instalment/);
    await f.call(setTerms, { id: "lmort", interestTerms: "manual" });
    expect(f.row("lmort").interestTerms).toBe("manual");
  });

  it("refuses a repayment date that is not a real date", async () => {
    const f = fixture();
    await expect(f.call(setTerms, { id: "l1", dueKind: "fixed", dueDate: NaN })).rejects.toThrow();
    await expect(f.call(setTerms, { id: "l1", dueKind: "fixed", dueDate: -5 })).rejects.toThrow();
    expect(f.row("l1").dueKind).toBeUndefined();
  });

  it("saves a due day with simple interest, keeps it through an update from Ask, and refuses a bad day", async () => {
    const f = fixture();
    await f.call(setTerms, { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8, interestDueDay: 10 });
    expect(f.row("l1").interestDueDay).toBe(10);
    await f.call(upsertLiability, { id: "l1", portfolioId: "pf", name: "Loan from a friend", kind: "loan", balance: 19000, currency: "EUR", counterparty: "Friend" });
    expect(f.row("l1")).toMatchObject({ balance: 19000, interestDueDay: 10 });
    await expect(f.call(setTerms, { id: "l1", interestDueDay: 29 })).rejects.toThrow(/1 to 28/);
    await f.call(setTerms, { id: "l1", interestTerms: "none" });
    expect(f.row("l1").interestDueDay).toBeUndefined();
  });

  it("refuses a repayment date more than 100 years ahead, which no calendar can show", async () => {
    const f = fixture();
    await expect(f.call(setTerms, { id: "l1", dueKind: "fixed", dueDate: 9e15 })).rejects.toThrow(/valid date/);
    await expect(f.call(upsertLiability, { id: "l1", portfolioId: "pf", name: "Loan from a friend", kind: "loan", balance: 20000, currency: "EUR", dueDate: 9e15 })).rejects.toThrow(/valid date/);
    await expect(f.call(update, { id: "l1", patch: { dueDate: 9e15 } })).rejects.toThrow(/valid date/);
    expect(f.row("l1").dueDate).toBeUndefined();
  });

  it("saves the history note in the same write as the terms, once per receipt, in the debt's space", async () => {
    const f = fixture();
    await f.call(setTerms, { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8 });
    const args = { id: "l1", interestRate: 10, note: { text: "Rate changed from 8% to 10%", occurredAt: NOW }, clientMutationId: "t-note" };
    await f.call(setTerms, args);
    await f.call(setTerms, args);
    expect(f.row("l1").interestRate).toBe(10);
    expect(f.notes()).toEqual([expect.objectContaining({ portfolioId: "pf", subject: "liability:l1", kind: "note", applied: false, note: "Rate changed from 8% to 10%" })]);
    // A note that would be refused stops the terms too, so they never go without it.
    await expect(f.call(setTerms, { id: "l1", interestRate: 12, note: { text: "x".repeat(141), occurredAt: NOW } })).rejects.toThrow(/140/);
    expect(f.row("l1").interestRate).toBe(10);
  });

  it("keeps a terms receipt to the debt's own space, so the same id in another space is refused, not replayed", async () => {
    const f = fixture();
    f.seed("memberships", "m3", { userId: "user", portfolioId: "other", role: "owner" });
    await f.call(setTerms, { id: "l1", interestTerms: "manual", clientMutationId: "shared-id" });
    await expect(f.call(setTerms, { id: "l-other", interestTerms: "manual", clientMutationId: "shared-id" })).rejects.toThrow();
    expect(f.row("l-other").interestTerms).toBeUndefined();
  });
});

describe("other writes keep the loan terms whole", () => {
  const simple = async (f: ReturnType<typeof fixture>) => f.call(setTerms, { id: "l1", principal: 20000, startedAt: NOW - 90 * DAY, interestTerms: "simple", interestRate: 8 });
  const upsert = (over: object) => ({ id: "l1", portfolioId: "pf", name: "Loan from a friend", kind: "loan", balance: 20000, currency: "EUR", ...over });

  it("refuses to make a simple-interest loan a mortgage or a card from Ask or an agent", async () => {
    const f = fixture();
    await simple(f);
    await expect(f.call(upsertLiability, upsert({ kind: "mortgage" }))).rejects.toThrow(/Mark its interest as manual/);
    await expect(f.call(upsertLiability, upsert({ kind: "credit_card" }))).rejects.toThrow(/Mark its interest as manual/);
    expect(f.row("l1").kind).toBe("loan");
  });

  it("refuses the web app's edits that would break the terms: kind, rate or currency", async () => {
    const f = fixture();
    await simple(f);
    await expect(f.call(update, { id: "l1", patch: { kind: "mortgage" } })).rejects.toThrow(/Mark its interest as manual/);
    await expect(f.call(update, { id: "l1", patch: { interestRate: null } })).rejects.toThrow(/yearly rate above zero/);
    await expect(f.call(update, { id: "l1", patch: { currency: "USD" } })).rejects.toThrow(/before changing the currency/);
    expect(f.row("l1")).toMatchObject({ kind: "loan", interestRate: 8, currency: "EUR" });
    // Edits that keep the terms whole still go through.
    await f.call(update, { id: "l1", patch: { name: "Loan from Lena", interestRate: 9 } });
    expect(f.row("l1")).toMatchObject({ name: "Loan from Lena", interestRate: 9 });
  });

  it("lets the web app clear a fixed loan's date, which makes it no longer fixed", async () => {
    const f = fixture();
    await f.call(update, { id: "lfixed", patch: { dueDate: null } });
    expect(f.row("lfixed").dueDate).toBeUndefined();
    expect(f.row("lfixed").dueKind).toBeUndefined();
  });

  it("refuses a currency change from Ask on a debt with an original amount", async () => {
    const f = fixture();
    await simple(f);
    await expect(f.call(upsertLiability, upsert({ currency: "USD" }))).rejects.toThrow(/before changing the currency/);
    expect(f.row("l1").currency).toBe("EUR");
  });
});
