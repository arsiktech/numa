import { describe, expect, it } from "vitest";
import { addMoney, assertClassifiedAccounts, financeMonth, majorUnits, minorUnits, exactPositiveMoney, type FinanceClassification } from "./lib/finance";
import { recordClassifiedTransaction, reverseClassifiedTransaction, removeTransaction, recordTransaction, upsertAccount } from "./ledger";
import { add, update, remove } from "./transactions";
import { createTransaction, updateTransaction, deleteTransaction, upsertAsset } from "./mobile";
import { materializeForPortfolio } from "./recurring";
import { buildMobileDashboard } from "./lib/mobileDashboard";
import { ledgerCashflow, ledgerNetWorth, assertBalancedLedgerLines } from "../src/lib/ledger";

import { add as addHolding, update as updateHolding } from "./holdings";
import { add as addSnapshot, update as updateSnapshot } from "./wealthSnapshots";
import { add as addAsset, update as updateAsset, adjustBalance } from "./assets";

const NOW = Date.parse("2026-09-12T12:00:00Z");

// Bounded synthetic DB adapter exercises the registered handlers and real auth,
// receipt, reference and arithmetic helpers. Not a deployed Convex runtime test.
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  let user: string | null = "user";
  const seed = (table: string, id: string, value: object) => {
    rows.set(id, { _id: id, ...value }); tables.set(id, table); return id;
  };
  seed("users", "user", { email: "synthetic@example.com" });
  seed("users", "intruder", { email: "synthetic-intruder@example.com" });
  seed("users", "other-account", { email: "synthetic-other@example.com" });
  seed("memberships", "member", { userId: "user", portfolioId: "pf", role: "owner" });
  for (const [id, kind, normalBalance] of [
    ["cash", "asset", "debit"], ["bank", "asset", "debit"], ["debt", "liability", "credit"],
    ["income", "income", "credit"], ["expense", "expense", "debit"], ["equity", "equity", "credit"]
  ]) seed("ledgerAccounts", id!, { portfolioId: "pf", kind, normalBalance, currency: "EUR", name: id });
  seed("assets", "cash-asset", { portfolioId: "pf", kind: "cash", balance: 0, currency: "EUR" });
  seed("assets", "foreign", { portfolioId: "other", kind: "cash", balance: 500, currency: "EUR" });
  seed("assets", "usd", { portfolioId: "pf", kind: "cash", balance: 500, currency: "USD" });
  const db = {
    get: async (id: string) => rows.has(id) ? { ...rows.get(id) } : null,
    insert: async (table: string, value: object) => seed(table, `${table}-${++sequence}`, value),
    patch: async (id: string, patch: object) => { rows.set(id, { ...rows.get(id), ...patch }); },
    delete: async (id: string) => { rows.delete(id); tables.delete(id); },
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      const collect = async () => [...rows].filter(([id, row]) => tables.get(id) === table && predicates.every(p => p(row))).map(([, row]) => ({ ...row }));
      const query = {
        withIndex: (_index: string, callback: any) => {
          const builder = { eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return builder; } };
          callback(builder); return query;
        },
        filter: (callback: any) => { predicates.push(callback({ field: (key: string) => key, eq: (key: string, value: unknown) => (row: any) => row[key] === value })); return query; },
        collect,
        first: async () => (await collect())[0] ?? null,
        unique: async () => { const values = await collect(); if (values.length > 1) throw new Error("Not unique"); return values[0] ?? null; }
      };
      return query;
    }
  };
  const ctx = { db, auth: { getUserIdentity: async () => user ? { subject: user } : null } } as any;
  const call = async (mutation: any, args: object) => {
    const savedRows = structuredClone(rows), savedTables = new Map(tables);
    try { return await mutation._handler(ctx, args); }
    catch (error) { rows.clear(); savedRows.forEach((v, k) => rows.set(k, v)); tables.clear(); savedTables.forEach((v, k) => tables.set(k, v)); throw error; }
  };
  return { ctx, rows, seed, call, signOut: () => { user = null; }, all: (table: string) => [...rows].filter(([id]) => tables.get(id) === table).map(([, row]) => ({ ...row, id: row._id })) };
}

const entry = (classification: FinanceClassification, debitAccountId: string, creditAccountId: string, amount = 100) => ({
  portfolioId: "pf", classification, debitAccountId, creditAccountId, amount, currency: "EUR",
  occurredAt: NOW, description: "Synthetic entry", sourceEventId: classification, clientMutationId: `ledger:${classification}`
});
const transaction = { portfolioId: "pf", kind: "income", amount: 100, currency: "EUR", occurredAt: NOW, accountId: "cash-asset", description: "Synthetic income", clientMutationId: "create" };

describe("asset balance write integrity", () => {
  const asset = { portfolioId: "pf", name: "Cash", kind: "cash", balance: 0, currency: "EUR", clientMutationId: "asset" };
  it("applies the same balance guard to native creates and changed balances", async () => {
    const f = fixture();
    for (const balance of [NaN, Infinity, -Infinity, 90_000_000_001, 1.005]) {
      await expect(f.call(upsertAsset, { ...asset, balance })).rejects.toThrow();
      await expect(f.call(upsertAsset, { ...asset, id: "cash-asset", balance })).rejects.toThrow();
    }
    expect(f.rows.get("cash-asset").balance).toBe(0);
    expect(f.all("assets")).toHaveLength(3);
    expect(f.all("mutationReceipts")).toHaveLength(0);
    const result = await f.call(upsertAsset, { ...asset, balance: -10.01 });
    expect(f.rows.get(result.id).balance).toBe(-10.01);
    expect(await f.call(upsertAsset, { ...asset, balance: -10.01 })).toMatchObject({ id: result.id, replayed: true });
    await f.call(upsertAsset, { ...asset, id: result.id, balance: 0, clientMutationId: "edit" });
    expect(f.rows.get(result.id).balance).toBe(0);
    f.rows.get("member").role = "viewer";
    await expect(f.call(upsertAsset, { ...asset, balance: -10.01 })).rejects.toThrow();
  });
  it("preserves unchanged native legacy balances and permits an explicit repair", async () => {
    const f = fixture();
    for (const balance of [1.005, NaN, Infinity]) {
      f.rows.get("cash-asset").balance = balance;
      await f.call(upsertAsset, { ...asset, id: "cash-asset", balance, name: "Renamed", clientMutationId: undefined });
      expect(Object.is(f.rows.get("cash-asset").balance, balance)).toBe(true);
      expect(f.rows.get("cash-asset").name).toBe("Renamed");
    }
    await f.call(upsertAsset, { ...asset, id: "cash-asset", balance: 1.01 });
    expect(f.rows.get("cash-asset").balance).toBe(1.01);
  });
  it("rejects corrupt balances before create or update without retaining receipts", async () => {
    const f = fixture();
    for (const balance of [NaN, Infinity, -Infinity, 90_000_000_001, 1.005]) {
      await expect(f.call(addAsset, { ...asset, balance })).rejects.toThrow();
      await expect(f.call(updateAsset, { id: "cash-asset", patch: { balance }, clientMutationId: "edit" })).rejects.toThrow();
    }
    expect(f.all("assets")).toHaveLength(3);
    expect(f.rows.get("cash-asset").balance).toBe(0);
    expect(f.all("mutationReceipts")).toHaveLength(0);
    const created = await f.call(addAsset, { ...asset, balance: -10.01 });
    expect(f.rows.get(created.id).balance).toBe(-10.01);
    await f.call(updateAsset, { id: created.id, patch: { balance: 0 }, clientMutationId: "edit" });
    expect(f.rows.get(created.id).balance).toBe(0);
  });
  it("preserves historical sub-cent balances during metadata edits", async () => {
    const f = fixture();
    f.rows.get("cash-asset").balance = 1.005;
    await f.call(updateAsset, { id: "cash-asset", patch: { name: "Renamed" } });
    expect(f.rows.get("cash-asset")).toMatchObject({ name: "Renamed", balance: 1.005 });
  });
  it("preserves legacy balances in full web edit payloads while validating changes", async () => {
    const f = fixture();
    f.rows.get("cash-asset").balance = 1.005;
    f.rows.get("cash-asset").notes = "Old notes";
    const edit = {
      id: "cash-asset",
      clientMutationId: "web-metadata",
      // AssetDialog resends every field; buildCloudAssetPatch clears notes with null.
      patch: { name: "Renamed", kind: "cash", balance: 1.005, currency: "EUR", notes: null }
    };
    await f.call(updateAsset, edit);
    expect(f.rows.get("cash-asset")).toMatchObject({ name: "Renamed", balance: 1.005, notes: undefined });
    expect(await f.call(updateAsset, edit)).toMatchObject({ replayed: true });
    for (const balance of [1.006, NaN, Infinity, 90_000_000_001]) {
      await expect(f.call(updateAsset, {
        ...edit, clientMutationId: "invalid-web-edit", patch: { ...edit.patch, balance }
      })).rejects.toThrow();
    }
    expect(f.rows.get("cash-asset").balance).toBe(1.005);
    expect(f.all("mutationReceipts")).toHaveLength(1);
    f.rows.get("member").role = "viewer";
    await expect(f.call(updateAsset, edit)).rejects.toThrow();
    f.rows.get("member").role = "owner";
    await f.call(updateAsset, {
      ...edit, clientMutationId: "repair-web-balance", patch: { ...edit.patch, balance: 1.01 }
    });
    expect(f.rows.get("cash-asset").balance).toBe(1.01);
  });
  it("adds cents and FX deltas once and rejects overflow without changing the account", async () => {
    const f = fixture();
    f.rows.get("cash-asset").balance = 0.1;
    const args = { id: "cash-asset", delta: 0.2, clientMutationId: "contribution" };
    await f.call(adjustBalance, args);
    expect(f.rows.get("cash-asset").balance).toBe(0.3);
    expect(await f.call(adjustBalance, args)).toMatchObject({ replayed: true });
    expect(f.rows.get("cash-asset").balance).toBe(0.3);
    await f.call(adjustBalance, { ...args, delta: 1.005, clientMutationId: "fx" });
    expect(f.rows.get("cash-asset").balance).toBe(1.31);
    f.rows.get("cash-asset").balance = 90_000_000_000;
    await expect(f.call(adjustBalance, { ...args, delta: 0.01, clientMutationId: "overflow" })).rejects.toThrow();
    expect(f.rows.get("cash-asset").balance).toBe(90_000_000_000);
    f.rows.get("cash-asset").balance = NaN;
    await expect(f.call(adjustBalance, { ...args, clientMutationId: "unknown" })).rejects.toThrow();
    expect(f.rows.get("cash-asset").balance).toBeNaN();
    expect(f.all("mutationReceipts")).toHaveLength(2);
  });
  it("requires current editor authorization even when replaying a contribution", async () => {
    const f = fixture();
    const args = { id: "cash-asset", delta: 1, clientMutationId: "contribution" };
    await f.call(adjustBalance, args);
    f.rows.get("member").role = "viewer";
    await expect(f.call(adjustBalance, args)).rejects.toThrow();
    await expect(f.call(addAsset, asset)).rejects.toThrow();
    await expect(f.call(updateAsset, { id: "cash-asset", patch: { balance: 2 } })).rejects.toThrow();
    expect(f.rows.get("cash-asset").balance).toBe(1);
  });
});

describe("snapshot update integrity", () => {
  const snapshot = { portfolioId: "pf", takenAt: NOW, netWorth: 100, liquid: 100, invested: 0, hardAssets: 0, liabilities: 0, currency: "EUR", isAuto: false, clientMutationId: "snapshot" };
  it("keeps legacy metadata editable but requires a complete valid financial repair", async () => {
    const f = fixture();
    const result = await f.call(addSnapshot, snapshot);
    f.rows.get(result.id).netWorth = 200;
    f.rows.get(result.id).takenAt = Infinity;
    await f.call(updateSnapshot, { id: result.id, patch: { label: "Legacy record", isAuto: false } });
    expect(f.rows.get(result.id)).toMatchObject({ label: "Legacy record", netWorth: 200, takenAt: Infinity });
    await expect(f.call(updateSnapshot, { id: result.id, patch: { currency: "USD" } })).rejects.toThrow();
    await expect(f.call(updateSnapshot, { id: result.id, patch: { takenAt: NOW } })).rejects.toThrow();
    await f.call(updateSnapshot, { id: result.id, patch: { takenAt: NOW, netWorth: 100 } });
    expect(f.rows.get(result.id)).toMatchObject({ takenAt: NOW, netWorth: 100, liquid: 100, label: "Legacy record" });
  });
  it("validates complete merged financial values and leaves rejected changes untouched", async () => {
    const f = fixture();
    const result = await f.call(addSnapshot, snapshot);
    for (const patch of [{ netWorth: 200 }, { liquid: NaN }, { invested: Infinity }, { takenAt: Infinity }, { takenAt: 1.5 }, { liabilities: 90_000_000_001 }]) {
      await expect(f.call(updateSnapshot, { id: result.id, patch, clientMutationId: "invalid-edit" })).rejects.toThrow();
    }
    expect(f.rows.get(result.id)).toMatchObject({ takenAt: NOW, netWorth: 100, liquid: 100, invested: 0 });
    expect(f.all("mutationReceipts")).toHaveLength(1);
    await f.call(updateSnapshot, { id: result.id, patch: { liquid: 125, netWorth: 125 }, clientMutationId: "valid-edit" });
    expect(f.rows.get(result.id)).toMatchObject({ liquid: 125, netWorth: 125 });
  });
  it("allows label-only edits, replays once, and checks current authorization", async () => {
    const f = fixture();
    const result = await f.call(addSnapshot, snapshot);
    const edit = { id: result.id, patch: { label: "Reviewed" }, clientMutationId: "edit" };
    await f.call(updateSnapshot, edit);
    expect(await f.call(updateSnapshot, edit)).toMatchObject({ id: result.id, replayed: true });
    expect(f.rows.get(result.id)).toMatchObject({ label: "Reviewed", netWorth: 100, liquid: 100 });
    f.rows.get("member").role = "viewer";
    await expect(f.call(updateSnapshot, edit)).rejects.toThrow();
  });
});

describe("financial precision and periods", () => {
  it("rounds decimal ties away from zero, sums cents and rejects unsupported precision", () => {
    expect(minorUnits(1.005)).toBe(101); expect(minorUnits(-1.005)).toBe(-101);
    expect(addMoney(0.1, 0.2)).toBe(0.3); expect(minorUnits(1e-7)).toBe(0);
    for (const value of [NaN, Infinity, -Infinity, 90_000_000_001]) expect(() => minorUnits(value)).toThrow();
    for (const value of [0, -1, 1.005]) expect(() => exactPositiveMoney(value)).toThrow();
    expect(() => majorUnits(9_000_000_000_001)).toThrow();
    expect(() => assertBalancedLedgerLines([{ side: "debit", amount: 1, currency: "EUR" }, { side: "credit", amount: 1, currency: "USD" }])).toThrow();
  });
  it("uses UTC half-open month boundaries including year rollover", () => {
    expect(financeMonth(Date.parse("2026-12-31T23:59:59.999Z"))).toEqual({ start: Date.parse("2026-12-01Z"), end: Date.parse("2027-01-01Z"), timezone: "UTC" });
    expect(() => financeMonth(NaN)).toThrow();
  });
  it("rejects loan proceeds or principal mapped to operating income/expenses", () => {
    expect(() => assertClassifiedAccounts("loan_advance", "asset", "income")).toThrow();
    expect(() => assertClassifiedAccounts("principal_repayment", "expense", "asset")).toThrow();
  });
  it("rounds historical sub-cent ledger reads without accepting new sub-cent writes", () => {
    const f = fixture();
    const lines = [
      { portfolioId: "pf", ledgerTransactionId: "historical", ledgerAccountId: "cash", side: "debit" as const, amount: 1.005, currency: "EUR" as const },
      { portfolioId: "pf", ledgerTransactionId: "historical", ledgerAccountId: "income", side: "credit" as const, amount: 1.005, currency: "EUR" as const }
    ];
    expect(ledgerCashflow(f.all("ledgerAccounts"), lines)).toEqual({ income: 1.01, expense: 0, net: 1.01 });
    expect(ledgerNetWorth(f.all("ledgerAccounts"), lines).netWorth).toBe(1.01);
    expect(() => assertBalancedLedgerLines(lines)).toThrow(/two decimal/);
  });
});

describe("classified ledger mutation boundary", () => {
  it("separates all seven classes, preserving transfer/net-worth and operating totals", async () => {
    const f = fixture();
    for (const args of [entry("opening_balance", "cash", "equity", 50), entry("earned_income", "cash", "income", 1000),
      entry("expense", "expense", "cash", 200), entry("loan_advance", "cash", "debt", 10000),
      entry("principal_repayment", "debt", "cash", 500), entry("transfer", "bank", "cash", 100),
      entry("funding_distribution", "equity", "cash", 50)]) await f.call(recordClassifiedTransaction, args);
    expect(ledgerCashflow(f.all("ledgerAccounts"), f.all("ledgerLines"))).toEqual({ income: 1000, expense: 200, net: 800 });
    expect(ledgerNetWorth(f.all("ledgerAccounts"), f.all("ledgerLines"))).toEqual({ assets: 10300, liabilities: 9500, netWorth: 800 });
    expect(f.all("transactions")).toHaveLength(0);
    expect(f.rows.get("cash-asset").balance).toBe(0); // Ledger is not added to legacy balances.
  });
  it("deduplicates transfer transport retries and stable source identity", async () => {
    const f = fixture(), args = entry("transfer", "cash", "bank");
    const first = await f.call(recordClassifiedTransaction, args);
    expect(await f.call(recordClassifiedTransaction, args)).toMatchObject({ id: first.id, replayed: true });
    expect(await f.call(recordClassifiedTransaction, { ...args, clientMutationId: "new-key" })).toMatchObject({ id: first.id });
    await expect(f.call(recordClassifiedTransaction, { ...args, amount: 200, clientMutationId: "conflict" })).rejects.toThrow(/different financial posting/);
    expect(f.all("ledgerLines")).toHaveLength(2);
  });
  it("appends one full refund in its own period, without deleting history", async () => {
    const f = fixture();
    const first = await f.call(recordClassifiedTransaction, entry("earned_income", "cash", "income"));
    const refund = { id: first.id, occurredAt: Date.parse("2026-10-01Z"), description: "Full refund", clientMutationId: "refund" };
    const result = await f.call(reverseClassifiedTransaction, refund);
    expect(await f.call(reverseClassifiedTransaction, refund)).toMatchObject({ id: result.id, replayed: true });
    expect(await f.call(reverseClassifiedTransaction, { ...refund, clientMutationId: "another-key" })).toMatchObject({ id: result.id });
    expect(ledgerCashflow(f.all("ledgerAccounts"), f.all("ledgerLines"))).toEqual({ income: 0, expense: 0, net: 0 });
    expect(ledgerCashflow(f.all("ledgerAccounts"), f.all("ledgerLines").filter(l => l.ledgerTransactionId === result.id)).income).toBe(-100);
    await expect(f.call(removeTransaction, { ledgerTransactionId: first.id })).rejects.toThrow(/immutable/);
    await expect(f.call(reverseClassifiedTransaction, { ...refund, id: result.id, clientMutationId: "reverse-refund" })).rejects.toThrow(/original classified/);
  });
  it("enforces current authorization before replay", async () => {
    const f = fixture(), args = entry("loan_advance", "cash", "debt");
    await f.call(recordClassifiedTransaction, args);
    f.rows.get("member").role = "viewer";
    await expect(f.call(recordClassifiedTransaction, args)).rejects.toThrow();
    f.signOut();
    await expect(f.call(recordClassifiedTransaction, args)).rejects.toThrow();
    expect(f.all("ledgerLines")).toHaveLength(2);
  });
  it("rejects cross-portfolio, wrong-currency, self-transfer and account reinterpretation", async () => {
    const f = fixture();
    f.rows.get("bank").currency = "USD";
    await expect(f.call(recordClassifiedTransaction, entry("transfer", "cash", "bank"))).rejects.toThrow(/currency/);
    f.rows.get("bank").currency = "EUR"; f.rows.get("bank").portfolioId = "other";
    await expect(f.call(recordClassifiedTransaction, entry("transfer", "cash", "bank"))).rejects.toThrow(/portfolio/);
    await expect(f.call(recordClassifiedTransaction, entry("transfer", "cash", "cash"))).rejects.toThrow(/distinct/);
    await f.call(recordClassifiedTransaction, entry("earned_income", "cash", "income"));
    await expect(f.call(upsertAccount, { id: "income", portfolioId: "pf", kind: "liability", normalBalance: "credit", currency: "EUR", name: "Reinterpret" })).rejects.toThrow(/definition/);
    await expect(f.call(recordTransaction, { portfolioId: "pf", sourceType: "manual", occurredAt: NOW, currency: "EUR", description: "Bad raw posting", lines: [
      { ledgerAccountId: "cash", side: "debit", amount: 100, currency: "USD" }, { ledgerAccountId: "income", side: "credit", amount: 100, currency: "USD" }
    ] })).rejects.toThrow(/currency/);
  });
});

describe.each([
  ["web", add, update, remove], ["mobile", createTransaction, updateTransaction, deleteTransaction]
])("%s legacy transaction compatibility", (label, create, edit, destroy) => {
  it("replays pre-scope receipts, but rejects a surviving result in a different portfolio", async () => {
    const f = fixture();
    const original = await f.call(create, transaction);
    const receipt = f.all("mutationReceipts")[0];
    delete f.rows.get(receipt._id).scopeId;
    expect(await f.call(create, transaction)).toMatchObject({ id: original.id, replayed: true });
    f.seed("memberships", "other-member", { userId: "user", portfolioId: "other", role: "owner" });
    await expect(f.call(create, { ...transaction, portfolioId: "other", accountId: "foreign" })).rejects.toThrow(/different portfolio/);
    await f.call(destroy, { id: original.id, clientMutationId: "delete-old" });
    const deletion = f.all("mutationReceipts").find(r => r.clientMutationId === "delete-old");
    delete f.rows.get(deletion._id).scopeId;
    expect(await f.call(destroy, { id: original.id, clientMutationId: "delete-old" })).toMatchObject({ id: original.id, replayed: true });
    expect(f.all("transactions")).toHaveLength(0);
    expect(f.rows.get("cash-asset").balance).toBe(0);
  });
  it("can edit, clear and delete historical categories without accepting a new invalid assignment", async () => {
    const f = fixture();
    f.seed("categories", "category", { portfolioId: "pf", kind: "income" });
    const original = await f.call(create, { ...transaction, categoryId: "category" });
    f.rows.delete("category");
    const editArgs = (patch: object, key: string) => label === "web" ? { id: original.id, patch, clientMutationId: key } : { id: original.id, ...patch, clientMutationId: key };
    await f.call(edit, editArgs({ amount: 80 }, "amount"));
    await expect(f.call(edit, editArgs({ categoryId: "missing" }, "invalid-category"))).rejects.toThrow(/Category/);
    await f.call(edit, editArgs({ categoryId: null }, "clear-category"));
    expect(f.rows.get(original.id).categoryId).toBeUndefined();
    await f.call(destroy, { id: original.id, clientMutationId: "delete" });
    expect(f.rows.get("cash-asset").balance).toBe(0);
    f.seed("categories", "category", { portfolioId: "pf", kind: "income" });
    const another = await f.call(create, { ...transaction, categoryId: "category", clientMutationId: "create-2" });
    f.rows.get("category").kind = "expense";
    await f.call(destroy, { id: another.id, clientMutationId: "delete-2" });
    expect(f.rows.get("cash-asset").balance).toBe(0);
  });
  it("keeps receipts, exact balances and deleted-record retries coherent", async () => {
    const f = fixture();
    const created = await f.call(create, transaction);
    expect(await f.call(create, transaction)).toMatchObject({ id: created.id, replayed: true });
    const patch = { amount: 0.3 };
    await f.call(edit, label === "web" ? { id: created.id, patch, clientMutationId: "edit" } : { id: created.id, ...patch, clientMutationId: "edit" });
    expect(f.rows.get("cash-asset").balance).toBe(0.3);
    const deleted = await f.call(destroy, { id: created.id, clientMutationId: "delete" });
    expect(await f.call(destroy, { id: created.id, clientMutationId: "delete" })).toMatchObject({ id: deleted.id, replayed: true });
    expect(f.rows.get("cash-asset").balance).toBe(0);
    f.rows.get("member").role = "viewer";
    await expect(f.call(destroy, { id: created.id, clientMutationId: "delete" })).rejects.toThrow();
  });
  it("rejects foreign/cross-currency accounts, invalid amounts, period and unauthorized writes", async () => {
    const f = fixture();
    for (const patch of [{ accountId: "foreign" }, { accountId: "usd" }, { amount: NaN }, { amount: 1.005 }, { occurredAt: Infinity }]) {
      await expect(f.call(create, { ...transaction, ...patch })).rejects.toThrow();
    }
    expect(f.all("transactions")).toHaveLength(0);
    f.rows.get("member").role = "viewer";
    await expect(f.call(create, transaction)).rejects.toThrow();
    expect(f.rows.get("foreign").balance).toBe(500);
  });
});

describe("recurring legacy cash boundary", () => {
  it("detaches deleted categories and posts exact cash deltas only once", async () => {
    const f = fixture();
    f.seed("recurring", "rule", { ...transaction, categoryId: "deleted", active: true, nextRunAt: NOW, cadence: "monthly" });
    await f.call(materializeForPortfolio, { portfolioId: "pf", now: NOW });
    await f.call(materializeForPortfolio, { portfolioId: "pf", now: NOW });
    expect(f.all("transactions")).toHaveLength(1);
    expect(f.all("transactions")[0].categoryId).toBeUndefined();
    expect(f.rows.get("cash-asset").balance).toBe(100);
  });
});

describe("legacy/mobile/ledger reconciliation", () => {
  it("agrees on operating totals without combining parallel histories", async () => {
    const f = fixture();
    await f.call(createTransaction, transaction);
    await f.call(createTransaction, { ...transaction, amount: 20, kind: "expense", clientMutationId: "expense" });
    await f.call(recordClassifiedTransaction, entry("earned_income", "cash", "income", 100));
    await f.call(recordClassifiedTransaction, entry("expense", "expense", "cash", 20));
    await f.call(recordClassifiedTransaction, entry("loan_advance", "cash", "debt", 10000));
    const dashboard = buildMobileDashboard({ portfolio: { defaultCurrency: "EUR" }, transactions: f.all("transactions"), assets: [f.rows.get("cash-asset")], liabilities: [], holdings: [], goals: [], nowMs: NOW });
    expect(dashboard.monthIncome).toBe(ledgerCashflow(f.all("ledgerAccounts"), f.all("ledgerLines")).income);
    expect(dashboard.monthCashflow).toBe(80); expect(dashboard.netWorth).toBe(80);
    expect(dashboard.dataQuality).toMatchObject({ ledgerIncluded: false, timezone: "UTC", generatedAt: NOW, minorUnitScale: 2, fxEstimated: true, fxAsOf: null });
  });
  it("excludes future/month-end records and fails closed on unknown money", () => {
    const input = { portfolio: { defaultCurrency: "EUR" as const }, transactions: [], assets: [], liabilities: [], holdings: [], goals: [], nowMs: NOW };
    const tx = { kind: "income" as const, amount: 100, currency: "EUR" as const };
    expect(buildMobileDashboard({ ...input, transactions: [
      { ...tx, occurredAt: Date.parse("2026-09-01Z") - 1 }, { ...tx, occurredAt: Date.parse("2026-09-01Z") },
      { ...tx, occurredAt: NOW }, { ...tx, occurredAt: NOW + 1 }, { ...tx, occurredAt: Date.parse("2026-10-01Z") }
    ] }).monthIncome).toBe(200);
    expect(() => buildMobileDashboard({ ...input, assets: [{ kind: "cash", balance: NaN, currency: "EUR" }] })).toThrow();
    expect(() => buildMobileDashboard({ ...input, transactions: [{ ...tx, occurredAt: NOW, amount: Infinity }] })).toThrow();
    expect(() => ledgerNetWorth([{ id: "a", portfolioId: "pf", name: "a", kind: "asset", normalBalance: "debit", currency: "EUR" }, { id: "b", portfolioId: "pf", name: "b", kind: "asset", normalBalance: "debit", currency: "USD" }], [])).toThrow(/currency/);
  });
});


describe("holding purchase transaction and snapshot retries", () => {
  const holding = { portfolioId: "pf", symbol: "SPY", name: "Fund", kind: "etf", quantity: 2, costBasis: 100, currency: "EUR", acquiredAt: NOW, recordPurchase: true, clientMutationId: "purchase" };
  it("creates exactly one holding and purchase event across retries", async () => {
    const f = fixture();
    const result = await f.call(addHolding, holding);
    expect(await f.call(addHolding, holding)).toMatchObject({ id: result.id, replayed: true });
    expect(f.all("holdings")).toHaveLength(1);
    expect(f.all("holdingEvents")).toHaveLength(1);
    expect(f.all("holdingEvents")[0]).toMatchObject({ holdingId: result.id, quantity: 2, unitPrice: 50, total: 100 });
    await expect(f.call(updateHolding, { id: result.id, patch: { quantity: -1 } })).rejects.toThrow();
    expect(f.rows.get(result.id).quantity).toBe(2);
  });
  it("rolls back both records and the receipt if event insertion fails", async () => {
    const f = fixture();
    const insert = f.ctx.db.insert;
    f.ctx.db.insert = async (table: string, value: object) => {
      if (table === "holdingEvents") throw new Error("Injected event failure");
      return insert(table, value);
    };
    await expect(f.call(addHolding, holding)).rejects.toThrow(/Injected/);
    expect(f.all("holdings")).toHaveLength(0);
    expect(f.all("mutationReceipts")).toHaveLength(0);
    f.ctx.db.insert = insert;
    await f.call(addHolding, holding);
    expect(f.all("holdingEvents")).toHaveLength(1);
  });
  it("rejects invalid holding money and keeps authorization on replays", async () => {
    const f = fixture();
    for (const patch of [{ quantity: -1 }, { quantity: NaN }, { costBasis: -1 }, { costBasis: 1.005 }, { acquiredAt: Infinity }, { clientMutationId: undefined }]) {
      await expect(f.call(addHolding, { ...holding, ...patch })).rejects.toThrow();
    }
    await f.call(addHolding, holding);
    f.rows.get("member").role = "viewer";
    await expect(f.call(addHolding, holding)).rejects.toThrow();
  });
  it("deduplicates automatic snapshots by portfolio and UTC month across request IDs", async () => {
    const f = fixture();
    const input = { portfolioId: "pf", takenAt: NOW, netWorth: 100, liquid: 100, invested: 0, hardAssets: 0, liabilities: 0, currency: "EUR", isAuto: true, clientMutationId: "first" };
    const original = await f.call(addSnapshot, input);
    expect(await f.call(addSnapshot, { ...input, takenAt: NOW + 1, clientMutationId: "second" })).toMatchObject({ id: original.id });
    expect(f.all("wealthSnapshots")).toHaveLength(1);
    await f.call(addSnapshot, { ...input, takenAt: Date.parse("2026-10-01Z"), clientMutationId: "next-month" });
    expect(f.all("wealthSnapshots")).toHaveLength(2);
    await expect(f.call(addSnapshot, { ...input, netWorth: NaN, clientMutationId: "bad" })).rejects.toThrow();
    await expect(f.call(addSnapshot, { ...input, netWorth: 200, clientMutationId: "unreconciled" })).rejects.toThrow(/reconcile/);
  });

  it("keeps a date's lines only when they add up to its split, and lets them be replaced or cleared", async () => {
    const f = fixture();
    const base = { portfolioId: "pf", takenAt: NOW, netWorth: 1500, liquid: 1000, invested: 700, hardAssets: 0, liabilities: 200, currency: "EUR", label: "Wealth log", isAuto: false };
    const lines = [
      { group: "liquid", name: "EUR", amount: 1000 },
      { group: "crypto", name: "BTC", amount: 500 },
      { group: "stocks", name: "TESLA", amount: 200 },
      { group: "crypto", name: "STABLE$", amount: -200 }
    ];
    const id = await f.call(addSnapshot, { ...base, lines, clientMutationId: "with-lines" });
    expect(f.all("wealthSnapshots")[0].lines).toEqual(lines);
    await expect(f.call(addSnapshot, { ...base, takenAt: NOW + 1, lines: lines.slice(1), clientMutationId: "short" })).rejects.toThrow(/add up/);
    await expect(f.call(addSnapshot, { ...base, takenAt: NOW + 2, lines: [{ group: "liquid", name: " ", amount: 1000 }], clientMutationId: "nameless" })).rejects.toThrow(/name/);

    const snapshotId = typeof id === "string" ? id : id.id;
    await expect(f.call(updateSnapshot, { id: snapshotId, patch: { lines: [{ group: "liquid", name: "EUR", amount: 1 }] }, clientMutationId: "bad-patch" })).rejects.toThrow(/add up/);
    // The sheet can move a date's numbers and its lines together.
    await f.call(updateSnapshot, { id: snapshotId, patch: { netWorth: 1000, liquid: 1000, invested: 0, liabilities: 0, lines: [{ group: "liquid", name: "EUR", amount: 1000 }] }, clientMutationId: "replace" });
    expect(f.all("wealthSnapshots")[0]).toMatchObject({ netWorth: 1000, lines: [{ name: "EUR" }] });
    await f.call(updateSnapshot, { id: snapshotId, patch: { lines: [] }, clientMutationId: "clear" });
    expect(f.all("wealthSnapshots")[0].lines).toBeUndefined();
  });
});
