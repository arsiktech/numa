import { describe, expect, it } from "vitest";
import { createTransfer, updateTransfer, deleteTransfer, setCategoryBudget } from "./money";
import { update as updateAsset, remove as removeAsset } from "./assets";
import { upsertAsset, deleteAsset, portfolioSnapshot, createCategory } from "./mobile";
import { remove as removePortfolio, update as updatePortfolio } from "./portfolios";
import { add as addCategory, update as updateCategory } from "./categories";
import { buildMobileDashboard } from "./lib/mobileDashboard";

// Real registered handlers and auth/receipt/money helpers, using a bounded
// synthetic rollback adapter. This does NOT prove live Convex concurrency.
function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  let sequence = 0;
  let user: string | null = "user";
  const seed = (table: string, id: string, value: object) => {
    rows.set(id, { _id: id, ...value }); tables.set(id, table); return id;
  };
  seed("users", "user", {});
  seed("memberships", "member", { userId: "user", portfolioId: "pf", role: "owner" });
  seed("portfolios", "pf", { name: "Test space", defaultCurrency: "EUR", ownerId: "user", type: "personal", createdAt: 0 });
  seed("categories", "food", { portfolioId: "pf", name: "Food", kind: "expense", sortOrder: 0, icon: "tag", color: "mint" });
  seed("categories", "salary", { portfolioId: "pf", name: "Salary", kind: "income" });
  seed("assets", "bank-asset", { portfolioId: "pf", name: "Bank", kind: "cash", balance: 500, currency: "EUR" });
  seed("assets", "third-asset", { portfolioId: "pf", kind: "cash", balance: 100, currency: "EUR" });
  for (const [id, kind, normalBalance] of [
    ["cash", "asset", "debit"], ["bank", "asset", "debit"], ["debt", "liability", "credit"],
    ["income", "income", "credit"], ["expense", "expense", "debit"], ["equity", "equity", "credit"]
  ]) seed("ledgerAccounts", id!, { portfolioId: "pf", kind, normalBalance, currency: "EUR", name: id });
  seed("assets", "cash-asset", { portfolioId: "pf", kind: "cash", balance: 1000, currency: "EUR" });
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

const input = {
  portfolioId: "pf", fromAccountId: "cash-asset", toAccountId: "bank-asset", amount: 12.34,
  currency: "EUR", occurredAt: Date.parse("2020-01-01Z"), description: "Move money",
  sourceEventId: "event-1", clientMutationId: "create-1"
};

describe("legacy manual cash transfer boundary", () => {
  it("moves exact cents once without creating operating or ledger rows", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    expect(f.rows.get("cash-asset").balance).toBe(987.66);
    expect(f.rows.get("bank-asset").balance).toBe(512.34);
    expect(await f.call(createTransfer, { ...input, amount: 99 })).toMatchObject({ id: first.id, replayed: true });
    expect(await f.call(createTransfer, { ...input, clientMutationId: "transport-2" })).toMatchObject({ id: first.id });
    await expect(f.call(createTransfer, { ...input, amount: 99, clientMutationId: "transport-3" })).rejects.toThrow(/different transfer/);
    expect(f.all("cashTransfers")).toHaveLength(1);
    expect(f.all("transactions")).toHaveLength(0);
    expect(f.all("ledgerLines")).toHaveLength(0);
    expect(f.all("mutationReceipts").every(row => row.scopeId === "pf")).toBe(true);
  });

  it("edits both legs, reassigns accounts, and deletes once with source tombstone replay", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    await f.call(updateTransfer, { id: first.id, fromAccountId: "third-asset", amount: 20.01, notes: "memo", clientMutationId: "edit" });
    expect(f.rows.get("cash-asset").balance).toBe(1000);
    expect(f.rows.get("third-asset").balance).toBe(79.99);
    expect(f.rows.get("bank-asset").balance).toBe(520.01);
    await f.call(updateTransfer, { id: first.id, notes: null, clientMutationId: "clear" });
    expect(f.rows.get(first.id).notes).toBeUndefined();
    // Original create replay remains valid after correction.
    await f.call(createTransfer, { ...input, clientMutationId: "create-retry" });
    await f.call(deleteTransfer, { id: first.id, clientMutationId: "delete" });
    await f.call(deleteTransfer, { id: first.id, clientMutationId: "delete" });
    await f.call(deleteTransfer, { id: first.id, clientMutationId: "delete-again" });
    await f.call(createTransfer, { ...input, clientMutationId: "create-after-delete" });
    expect(f.rows.get("third-asset").balance).toBe(100);
    expect(f.rows.get("bank-asset").balance).toBe(500);
    expect(f.rows.get(first.id).deletedAt).toEqual(expect.any(Number));
    await expect(f.call(updateTransfer, { id: first.id, amount: 2, clientMutationId: "deleted-edit" })).rejects.toThrow(/deleted/);
  });

  it("combines overlapping account edits and rejects a corrupt historical reference before undo", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    await f.call(updateTransfer, { id: first.id, fromAccountId: "bank-asset", toAccountId: "cash-asset", amount: 0.01, clientMutationId: "swap" });
    expect(f.rows.get("cash-asset").balance).toBe(1000.01);
    expect(f.rows.get("bank-asset").balance).toBe(499.99);
    f.rows.get("bank-asset").currency = "USD";
    await expect(f.call(deleteTransfer, { id: first.id, clientMutationId: "bad-undo" })).rejects.toThrow(/currency/);
    expect(f.rows.get("cash-asset").balance).toBe(1000.01);
    expect(f.rows.get(first.id).deletedAt).toBeUndefined();
  });

  it("fails closed without partial balances or receipts for invalid references, money and time", async () => {
    for (const patch of [
      { toAccountId: "cash-asset" }, { toAccountId: "foreign" }, { toAccountId: "usd" },
      { toAccountId: "missing" }, { amount: 0 }, { amount: -1 }, { amount: 1.005 },
      { amount: Infinity }, { amount: 90_000_000_001 }, { occurredAt: Date.now() + 86400000 },
      { occurredAt: 1.5 }, { description: " " }, { sourceEventId: " " }, { clientMutationId: " " }
    ]) {
      const f = fixture();
      await expect(f.call(createTransfer, { ...input, ...patch })).rejects.toThrow();
      expect(f.rows.get("cash-asset").balance).toBe(1000);
      expect(f.rows.get("bank-asset").balance).toBe(500);
      expect(f.all("cashTransfers")).toHaveLength(0);
      expect(f.all("mutationReceipts")).toHaveLength(0);
    }
    const f = fixture();
    const first = await f.call(createTransfer, input);
    await expect(f.call(updateTransfer, { id: first.id, toAccountId: "foreign", clientMutationId: "bad-edit" })).rejects.toThrow();
    expect(f.rows.get("cash-asset").balance).toBe(987.66);
    expect(f.rows.get("bank-asset").balance).toBe(512.34);
    f.rows.get("bank-asset").balance = 90_000_000_000;
    await expect(f.call(createTransfer, { ...input, sourceEventId: "overflow", clientMutationId: "overflow" })).rejects.toThrow();
    expect(f.rows.get("cash-asset").balance).toBe(987.66);
  });

  it("checks current membership before transport or source replay and every write", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    f.rows.get("member").role = "viewer";
    for (const [operation, args] of [
      [createTransfer, input],
      [createTransfer, { ...input, clientMutationId: "fresh" }],
      [updateTransfer, { id: first.id, amount: 1, clientMutationId: "update" }],
      [deleteTransfer, { id: first.id, clientMutationId: "delete" }],
      [setCategoryBudget, { categoryId: "food", monthlyLimit: 100, clientMutationId: "budget" }]
    ] as const) await expect(f.call(operation, args)).rejects.toThrow();
    f.signOut();
    await expect(f.call(createTransfer, input)).rejects.toThrow();
  });

  it("guards native and web account deletion or redefinition while allowing names and balances", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    await expect(f.call(removeAsset, { id: "cash-asset" })).rejects.toThrow(/linked/);
    await expect(f.call(deleteAsset, { id: "bank-asset" })).rejects.toThrow(/linked/);
    await expect(f.call(updateAsset, { id: "cash-asset", patch: { currency: "USD" } })).rejects.toThrow(/linked/);
    await expect(f.call(upsertAsset, { id: "bank-asset", portfolioId: "pf", name: "Bank", kind: "other", currency: "EUR", balance: 512.34 })).rejects.toThrow(/linked/);
    await f.call(updateAsset, { id: "cash-asset", patch: { name: "Renamed" } });
    expect(f.rows.get("cash-asset").name).toBe("Renamed");
    await f.call(deleteTransfer, { id: first.id, clientMutationId: "delete" });
    await f.call(removeAsset, { id: "cash-asset" });
    expect(f.rows.has("cash-asset")).toBe(false);
    // Legacy income/expense and recurring references are protected as well.
    f.seed("transactions", "legacy", { portfolioId: "pf", accountId: "bank-asset" });
    await expect(f.call(deleteAsset, { id: "bank-asset" })).rejects.toThrow(/linked/);
    f.seed("recurring", "rule", { portfolioId: "pf", accountId: "third-asset" });
    await expect(f.call(removeAsset, { id: "third-asset" })).rejects.toThrow(/linked/);
  });

  it("exposes only active transfers with source metadata and no operating double counting", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    const snapshot = await f.call(portfolioSnapshot, { portfolioId: "pf" });
    expect(snapshot.transfers).toHaveLength(1);
    expect(snapshot.transfers[0]).toMatchObject({ id: first.id, amountMinor: 1234, createdByUserId: "user", sourceEventId: "event-1" });
    expect(snapshot.categories.find((row: any) => row.id === "food")).toMatchObject({ budgetCurrency: "EUR" });
    const dashboard = buildMobileDashboard({ portfolio: { defaultCurrency: "EUR" }, transactions: [], assets: f.all("assets").filter(row => row.portfolioId === "pf"), liabilities: [], holdings: [], goals: [] });
    expect(dashboard.monthIncome).toBe(0);
    expect(dashboard.monthExpenses).toBe(0);
    expect(dashboard.dataQuality.ledgerIncluded).toBe(false);
    await f.call(deleteTransfer, { id: first.id, clientMutationId: "delete" });
    expect((await f.call(portfolioSnapshot, { portfolioId: "pf" })).transfers).toEqual([]);
  });

  it("portfolio removal physically clears active transfers and tombstones", async () => {
    const f = fixture();
    const first = await f.call(createTransfer, input);
    await f.call(deleteTransfer, { id: first.id, clientMutationId: "delete" });
    await f.call(createTransfer, { ...input, sourceEventId: "second", clientMutationId: "second" });
    await f.call(removePortfolio, { id: "pf", clientMutationId: "remove-space" });
    expect(f.all("cashTransfers")).toEqual([]);
  });
});

describe("manual monthly category budgets", () => {
  it("sets and clears a validated scoped cap, preserving authoritative receipt replay", async () => {
    const f = fixture();
    await f.call(setCategoryBudget, { categoryId: "food", monthlyLimit: 123.45, clientMutationId: "budget" });
    await f.call(setCategoryBudget, { categoryId: "food", monthlyLimit: 999, clientMutationId: "budget" });
    expect(f.rows.get("food").monthlyLimit).toBe(123.45);
    await f.call(setCategoryBudget, { categoryId: "food", monthlyLimit: null, clientMutationId: "clear-budget" });
    expect(f.rows.get("food").monthlyLimit).toBeUndefined();
    expect(f.all("mutationReceipts").every(row => row.scopeId === "pf")).toBe(true);
    for (const monthlyLimit of [0, -1, 1.005, NaN, Infinity, 90_000_000_001]) {
      await expect(f.call(setCategoryBudget, { categoryId: "food", monthlyLimit, clientMutationId: "invalid-budget" })).rejects.toThrow();
    }
    await expect(f.call(setCategoryBudget, { categoryId: "salary", monthlyLimit: 1, clientMutationId: "income-cap" })).rejects.toThrow(/expense/);
    f.seed("categories", "foreign-category", { portfolioId: "other", kind: "expense" });
    await expect(f.call(setCategoryBudget, { categoryId: "foreign-category", monthlyLimit: 1, clientMutationId: "foreign-cap" })).rejects.toThrow();
  });
});

describe("persisted budget denomination", () => {
  it("freezes legacy caps before a default-currency change without relabeling known caps", async () => {
    const f = fixture();
    f.rows.get("food").monthlyLimit = 100;
    f.seed("categories", "known-usd", { portfolioId: "pf", kind: "expense", monthlyLimit: 200, monthlyLimitCurrency: "USD" });
    await f.call(updatePortfolio, { id: "pf", patch: { defaultCurrency: "USD" }, clientMutationId: "currency-usd" });
    expect(f.rows.get("food")).toMatchObject({ monthlyLimit: 100, monthlyLimitCurrency: "EUR" });
    expect(f.rows.get("known-usd")).toMatchObject({ monthlyLimit: 200, monthlyLimitCurrency: "USD" });
    expect(f.rows.get("salary").monthlyLimitCurrency).toBeUndefined();
    const snapshot = await f.call(portfolioSnapshot, { portfolioId: "pf" });
    expect(snapshot.categories.find((row: any) => row.id === "food").budgetCurrency).toBe("EUR");
    expect(snapshot.categories.find((row: any) => row.id === "known-usd").budgetCurrency).toBe("USD");
    await f.call(setCategoryBudget, { categoryId: "food", monthlyLimit: 125, clientMutationId: "edit-old-cap" });
    expect(f.rows.get("food")).toMatchObject({ monthlyLimit: 125, monthlyLimitCurrency: "EUR" });
    await f.call(updatePortfolio, { id: "pf", patch: { defaultCurrency: "EUR" }, clientMutationId: "currency-eur" });
    expect(f.rows.get("known-usd").monthlyLimitCurrency).toBe("USD");
  });

  it("aligns native and compatibility cap writes, keeps known currency, and clears denomination explicitly", async () => {
    const f = fixture();
    const added = await f.call(addCategory, { portfolioId: "pf", name: "Shopping", kind: "expense", icon: "tag", color: "mint", sortOrder: 1, monthlyLimit: 150, clientMutationId: "web-cap" });
    expect(f.rows.get(added.id).monthlyLimitCurrency).toBe("EUR");
    await f.call(updatePortfolio, { id: "pf", patch: { defaultCurrency: "USD" }, clientMutationId: "default-usd" });
    await f.call(updateCategory, { id: added.id, patch: { monthlyLimit: 175 }, clientMutationId: "web-cap-edit" });
    expect(f.rows.get(added.id)).toMatchObject({ monthlyLimit: 175, monthlyLimitCurrency: "EUR" });
    await f.call(updateCategory, { id: added.id, patch: { monthlyLimit: null }, clientMutationId: "web-cap-clear" });
    expect(f.rows.get(added.id).monthlyLimitCurrency).toBeUndefined();
    await f.call(setCategoryBudget, { categoryId: added.id, monthlyLimit: 180, clientMutationId: "new-cap" });
    expect(f.rows.get(added.id)).toMatchObject({ monthlyLimit: 180, monthlyLimitCurrency: "USD" });
    const native = await f.call(createCategory, { portfolioId: "pf", name: "Travel", kind: "expense", monthlyLimit: 250, clientMutationId: "native-cap" });
    expect(f.rows.get(native.id).monthlyLimitCurrency).toBe("USD");
    await f.call(setCategoryBudget, { categoryId: native.id, monthlyLimit: null, clientMutationId: "native-clear" });
    expect(f.rows.get(native.id).monthlyLimitCurrency).toBeUndefined();
    await expect(f.call(updateCategory, { id: added.id, patch: { kind: "income" }, clientMutationId: "income-with-cap" })).rejects.toThrow(/Remove/);
    await expect(f.call(updateCategory, { id: added.id, patch: { monthlyLimit: 1.005 }, clientMutationId: "invalid-web-cap" })).rejects.toThrow();
    await expect(f.call(createCategory, { portfolioId: "pf", name: "Bad", kind: "income", monthlyLimit: 10 })).rejects.toThrow(/expense/);
    expect(f.all("mutationReceipts").filter(row => ["categories.add", "categories.update"].includes(row.operation)).every(row => row.scopeId === "pf")).toBe(true);
  });
});
