import { describe, expect, it } from "vitest";
import { create, listMine, migrationPreview } from "./spaces";
import { portfolioSnapshot, createTransaction, upsertAsset, upsertLiability, upsertHolding, upsertGoal, deleteAsset, deleteLiability, deleteHolding } from "./mobile";
import { computeMyShareAcrossPortfolios } from "../src/lib/analytics";

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
  const ctx = { db, auth: { getUserIdentity: async () => user ? { subject: user } : null }, scheduler: { runAfter: async () => undefined } } as any;
  const call = async (mutation: any, args: object) => {
    const savedRows = structuredClone(rows), savedTables = new Map(tables);
    try { return await mutation._handler(ctx, args); }
    catch (error) { rows.clear(); savedRows.forEach((v, k) => rows.set(k, v)); tables.clear(); savedTables.forEach((v, k) => tables.set(k, v)); throw error; }
  };
  return { ctx, rows, seed, call, signOut: () => { user = null; }, signIn: (id: string) => { user = id; }, all: (table: string) => [...rows].filter(([id]) => tables.get(id) === table).map(([, row]) => ({ ...row, id: row._id })) };
}

const intent = { name: "Studio", spaceKind: "business", currency: "USD", clientMutationId: "create-studio" };
function legacy(f: ReturnType<typeof fixture>, id = "pf", type = "personal") {
  f.seed("portfolios", id, { name: id, type, defaultCurrency: "EUR", tagline: "", ownerId: "user", createdAt: 0 });
}

describe("isolated personal and business spaces", () => {
  it("creates an empty business without assuming equity and replays only the same intent", async () => {
    const f = fixture(); legacy(f);
    const before = structuredClone(f.rows.get("cash-asset"));
    const result = await f.call(create, intent);
    expect(await f.call(create, intent)).toMatchObject({ id: result.id, replayed: true });
    expect(f.all("portfolios")).toHaveLength(2);
    const membership = f.all("memberships").find(m => m.portfolioId === result.id);
    expect(membership).toMatchObject({ role: "owner", ownershipBps: 10000 });
    expect(membership.businessOwnershipBps).toBeUndefined();
    expect(f.rows.get("cash-asset")).toEqual(before);
    expect(f.all("assets").filter(a => a.portfolioId === result.id)).toMatchObject([{ balance: 0, currency: "USD" }]);
    await expect(f.call(create, { ...intent, name: "Other" })).rejects.toThrow(/different mutation/);
    f.rows.get(membership._id).role = "viewer";
    await expect(f.call(create, intent)).rejects.toThrow();
    f.signIn("intruder");
    await expect(f.call(create, intent)).rejects.toThrow();
  });

  it("supports explicit zero and partial ownership, rejects invalid inputs", async () => {
    const f = fixture();
    for (const bps of [0, 2500]) {
      const result = await f.call(create, { ...intent, businessOwnershipBps: bps, clientMutationId: `bps-${bps}` });
      expect(f.all("memberships").find(m => m.portfolioId === result.id).businessOwnershipBps).toBe(bps);
    }
    for (const bps of [-1, 10001, 12.5, NaN, Infinity]) {
      await expect(f.call(create, { ...intent, businessOwnershipBps: bps })).rejects.toThrow();
    }
    await expect(f.call(create, { ...intent, spaceKind: "personal", businessOwnershipBps: 100 })).rejects.toThrow();
    await expect(f.call(create, { ...intent, name: " " })).rejects.toThrow();
    await expect(f.call(create, { ...intent, clientMutationId: " " })).rejects.toThrow();
  });

  it("lists only current memberships, preserves legacy IDs and previews without moving data", async () => {
    const f = fixture(); legacy(f); legacy(f, "shared", "shared");
    f.seed("memberships", "shared-member", { userId: "user", portfolioId: "shared", role: "viewer", ownershipBps: 4000 });
    f.seed("memberships", "dangling", { userId: "user", portfolioId: "missing", role: "owner" });
    f.seed("moneyPods", "pod", { name: "Unchanged pod", ownerUserId: "user" });
    const before = JSON.stringify([...f.rows]);
    expect(await f.call(listMine, {})).toMatchObject([{ id: "pf", spaceKind: "personal" }, { id: "shared", spaceKind: "legacy_shared" }]);
    expect(await f.call(migrationPreview, { portfolioId: "shared" })).toMatchObject({
      portfolioId: "shared", explicitKind: null, preservesIds: true, recordsMoved: 0,
      destructive: false, automaticReassignment: false, consolidation: "not-combined"
    });
    expect(JSON.stringify([...f.rows])).toBe(before);
    f.signIn("other-account");
    expect(await f.call(listMine, {})).toEqual([]);
    await expect(f.call(migrationPreview, { portfolioId: "shared" })).rejects.toThrow();
    f.signOut();
    await expect(f.call(listMine, {})).rejects.toThrow();
  });

  it("scopes actual mobile snapshot records, summary and currency and rejects revoked reads", async () => {
    const f = fixture(); legacy(f);
    const business = await f.call(create, intent);
    const account = f.all("assets").find(a => a.portfolioId === business.id);
    await f.call(createTransaction, { portfolioId: business.id, accountId: account._id, kind: "income",
      amount: 250, currency: "USD", occurredAt: Date.now(), description: "Business only", clientMutationId: "income-business" });
    const a = await f.call(portfolioSnapshot, { portfolioId: "pf" });
    const b = await f.call(portfolioSnapshot, { portfolioId: business.id });
    expect(a.transactions).toHaveLength(0);
    expect(b.transactions).toHaveLength(1);
    expect(b.dashboard).toMatchObject({ currency: "USD", monthIncome: 250, monthCashflow: 250, netWorth: 250 });
    for (const snapshot of [a, b]) for (const key of ["transactions", "assets", "goals", "categories", "holdings", "liabilities", "recurring", "wealthSnapshots"]) {
      expect(snapshot[key].every((row: any) => row.portfolioId === snapshot.portfolio.id)).toBe(true);
    }
    const member = f.all("memberships").find(m => m.portfolioId === business.id);
    f.rows.delete(member._id);
    await expect(f.call(portfolioSnapshot, { portfolioId: business.id })).rejects.toThrow();
  });

  it.each([
    [upsertAsset, { name: "Cash", kind: "cash", balance: 50 }],
    [upsertLiability, { name: "Loan", kind: "loan", balance: 50 }],
    [upsertHolding, { name: "Fund", symbol: "DEMO", kind: "stock", quantity: 1, costBasis: 50, acquiredAt: 0 }],
    [upsertGoal, { scope: "monthly_income", target: 50, startAt: 0, createdAt: 0 }]
  ])("prevents cross-space native upsert receipts and foreign record updates", async (mutation, details) => {
    const f = fixture(); legacy(f);
    const business = await f.call(create, intent);
    const args = { ...details, portfolioId: "pf", currency: "EUR", clientMutationId: "upsert" };
    const first = await f.call(mutation, args);
    expect(await f.call(mutation, args)).toMatchObject({ id: first.id, replayed: true });
    await expect(f.call(mutation, { ...args, portfolioId: business.id })).rejects.toThrow(/different mutation/);
    const receipt = f.all("mutationReceipts").find(r => r.clientMutationId === "upsert");
    delete f.rows.get(receipt._id).scopeId;
    expect(await f.call(mutation, args)).toMatchObject({ id: first.id, replayed: true });
    await expect(f.call(mutation, { ...args, portfolioId: business.id })).rejects.toThrow(/different portfolio/);
    await expect(f.call(mutation, { ...args, id: first.id, portfolioId: business.id, clientMutationId: "foreign-update" })).rejects.toThrow(/not found/);
    f.rows.get("member").role = "viewer";
    await expect(f.call(mutation, args)).rejects.toThrow();
  });

  it.each([
    [upsertHolding, "holdings", { name: "Bitcoin", symbol: "BTC", kind: "crypto", quantity: 1, costBasis: 50, acquiredAt: 0 }],
    [upsertAsset, "assets", { name: "Gold", kind: "collectible", balance: 50 }],
  ] as const)("keeps where a record is kept unless the update says otherwise", async (mutation, table, details) => {
    const f = fixture(); legacy(f);
    const base = { ...details, portfolioId: "pf", currency: "EUR" };
    const { id } = await f.call(mutation, { ...base, location: "  Ledger   Nano ", clientMutationId: "add" });
    const saved = () => f.all(table).find((r) => r.id === id).location;
    expect(saved()).toBe("Ledger Nano");
    // An older client that doesn't know the field sends everything else; the place stays.
    await f.call(mutation, { ...base, id, clientMutationId: "older-client" });
    expect(saved()).toBe("Ledger Nano");
    await f.call(mutation, { ...base, id, location: "", clientMutationId: "clear" });
    expect(saved()).toBeUndefined();
    await expect(f.call(mutation, { ...base, id, location: "x".repeat(61), clientMutationId: "long" })).rejects.toThrow(/60 characters/);
  });

  it("values a debt owed in BTC at the live price, keeps it through edits, and refuses unknown assets", async () => {
    const f = fixture(); legacy(f);
    f.seed("marketQuotes", "q-btc", { symbol: "BTC", price: 80_000, changePercent: 0, provider: "coingecko", updatedAt: 1 });
    const base = { portfolioId: "pf", name: "Razmik", kind: "other", balance: 1, currency: "EUR" };
    const { id } = await f.call(upsertLiability, { ...base, owedSymbol: "btc", owedQuantity: 0.15, clientMutationId: "owe-btc" });
    const row = () => f.all("liabilities").find((r) => r.id === id);
    expect(row()).toMatchObject({ owedSymbol: "BTC", owedQuantity: 0.15, balance: 12_000, currency: "USD" });
    // An edit from a client that doesn't know the field keeps the debt in BTC.
    await f.call(upsertLiability, { ...base, id, balance: 5, clientMutationId: "rename" });
    expect(row()).toMatchObject({ owedSymbol: "BTC", owedQuantity: 0.15 });
    await expect(f.call(upsertLiability, { ...base, owedSymbol: "DOGE", owedQuantity: 1, clientMutationId: "doge" })).rejects.toThrow(/BTC, ETH/);
    await expect(f.call(upsertLiability, { ...base, owedSymbol: "BTC", clientMutationId: "noqty" })).rejects.toThrow(/how much/);
    const snapshot = await f.call(portfolioSnapshot, { portfolioId: "pf" });
    f.rows.get("q-btc").price = 100_000;
    const later = await f.call(portfolioSnapshot, { portfolioId: "pf" });
    expect(snapshot.liabilities.find((l: any) => l.id === id)).toMatchObject({ balance: 12_000, currency: "USD", owedSymbol: "BTC", owedQuantity: 0.15 });
    expect(later.liabilities.find((l: any) => l.id === id)).toMatchObject({ balance: 15_000 });
  });

  it("does not count a business entity as a personal asset, even with full admin ownership", () => {
    const portfolios = [
      { id: "personal", name: "Personal", type: "personal", ownerId: "user", defaultCurrency: "EUR", tagline: "", createdAt: 0 },
      { id: "business", name: "Studio", type: "personal", spaceKind: "business", ownerId: "user", defaultCurrency: "EUR", tagline: "", createdAt: 0 }
    ] as any;
    const memberships = portfolios.map((p: any) => ({ portfolioId: p.id, userId: "user", ownershipBps: 10000 }));
    const assets = portfolios.map((p: any) => ({ portfolioId: p.id, kind: "cash", balance: p.id === "business" ? 100000 : 500, currency: "EUR" }));
    const result = computeMyShareAcrossPortfolios("user", portfolios, memberships, assets, [], [], {});
    expect(result.total).toBe(500);
    expect(result.rows.map(r => r.portfolio.id)).toEqual(["personal"]);
  });
});

describe.each([
  ["assets", deleteAsset], ["liabilities", deleteLiability], ["holdings", deleteHolding]
])("%s native deletion replay isolation", (table, mutation) => {
  it("does not acknowledge a different-space deletion as successful", async () => {
    const f = fixture(); legacy(f);
    const b = await f.call(create, intent);
    f.seed(table, "delete-a", { portfolioId: "pf" });
    f.seed(table, "delete-b", { portfolioId: b.id });
    await f.call(mutation, { id: "delete-a", clientMutationId: "delete-key" });
    await expect(f.call(mutation, { id: "delete-b", clientMutationId: "delete-key" })).rejects.toThrow(/different mutation/);
    const receipt = f.all("mutationReceipts").find(r => r.clientMutationId === "delete-key");
    delete f.rows.get(receipt._id).scopeId;
    await expect(f.call(mutation, { id: "delete-b", clientMutationId: "delete-key" })).rejects.toThrow(/different record/);
    expect(f.rows.has("delete-b")).toBe(true);
  });
});
