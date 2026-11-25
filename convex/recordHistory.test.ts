// @vitest-environment node
import { describe, expect, it } from "vitest";
import { privacyFixture } from "../src/test/privacyFixture";
import { upsertAsset, deleteAsset, upsertLiability, deleteLiability, upsertHolding, deleteHolding } from "./mobile";
import { add as addEvent, remove as removeEvent } from "./debtEvents";
import { add as addWallet, update as updateWallet, remove as removeWallet } from "./cryptoWallets";
import { remove as removePortfolio } from "./portfolios";
import { save as saveReading } from "./liabilitySources";
import { backfillPage, deleted, list, purgeSpace } from "./recordHistory";
import { saveSnapshot } from "./walletSync";
import { AGENT_TOOLS, type AgentIo } from "./lib/agentTools";

const getLedger = AGENT_TOOLS.find(t => t.name === "get_ledger")!;

function fixture() {
  const f = privacyFixture();
  f.seed("portfolios", "pf", { name: "Synthetic", ownerId: "user", defaultCurrency: "EUR", type: "personal" });
  f.seed("memberships", "mine", { portfolioId: "pf", userId: "user", role: "owner" });
  f.seed("authSessions", "agent-session", { userId: "user", expirationTime: 9e15 });
  f.seed("agentConnections", "money-keeper", { userId: "user", sessionId: "agent-session", name: "Assistant", access: "full", tokenHash: "x", tokenHint: "numa_agent_0000", createdAt: 0 });
  const history = async (args: Record<string, unknown> = {}): Promise<Array<Record<string, any>>> => (await f.call(list, { portfolioId: "pf", ...args })).entries;
  /** get_ledger as an agent calls it, answered by the real query. */
  const io: AgentIo = {
    query: async (path, args) => {
      if (path === "spaces:listMine") return [{ id: "pf", name: "Synthetic", defaultCurrency: "EUR" }];
      if (path === "recordHistory:list") return f.call(list, args);
      throw new Error(`unexpected ${path}`);
    },
    mutation: async (path) => { if (path === "mobile:bootstrap") return { selectedPortfolioId: "pf" }; throw new Error(`unexpected ${path}`); },
    action: async () => null, requestId: () => "r", now: () => Date.now(),
  };
  return { f, history, ledger: (args: Record<string, unknown> = {}) => getLedger.run(io, args) as Promise<{ entries: any[]; next_cursor: string | null }> };
}

describe("change history", () => {
  it("records a debt's creation, rename, edit, events and deletion, and keeps them after it is gone", async () => {
    const { f, history, ledger } = fixture();
    const { id } = await f.call(upsertLiability, { portfolioId: "pf", name: "Friend loan", kind: "loan", balance: 100, currency: "EUR", clientMutationId: "c1" });
    await f.call(upsertLiability, { id, portfolioId: "pf", name: "Friend loan USDT", kind: "loan", balance: 100, currency: "EUR", clientMutationId: "c2", reason: "matches the wallet" });
    await f.call(upsertLiability, { id, portfolioId: "pf", name: "Friend loan USDT", kind: "loan", balance: 40, currency: "EUR", clientMutationId: "c3" });
    const event = await f.call(addEvent, { portfolioId: "pf", subject: `liability:${id}`, kind: "repaid", amount: 40, unit: "EUR", occurredAt: Date.now() - 1000, apply: true, clientMutationId: "c4", reason: "paid in cash" });
    await f.call(removeEvent, { id: event.id ?? event, clientMutationId: "c5" });
    await f.call(deleteLiability, { id, clientMutationId: "c6", reason: "fully repaid" });
    expect(f.rows.has(id)).toBe(false);

    const rows = (await history({ recordId: id })).reverse();
    expect(rows.map(r => [r.action, r.field ?? null])).toEqual([
      ["created", null],
      ["changed", "name"],
      ["changed", "balance"],
      ["changed", "balance"], // the repayment, applied
      ["event_added", "repaid"],
      ["changed", "balance"], // the repayment given back
      ["event_removed", "repaid"],
      ["deleted", null],
    ]);
    expect(rows[0]).toMatchObject({ recordType: "liability", recordName: "Friend loan", values: { name: "Friend loan", balance: 100, kind: "loan" } });
    expect(rows[1]).toMatchObject({ oldValue: "Friend loan", newValue: "Friend loan USDT", recordName: "Friend loan USDT", reason: "matches the wallet" });
    expect(rows[2]).toMatchObject({ oldValue: 100, newValue: 40 });
    expect(rows[3]).toMatchObject({ oldValue: 40, newValue: 0, reason: "paid in cash" });
    expect(rows[4]).toMatchObject({ newValue: 40, values: { kind: "repaid", amount: 40, unit: "EUR", applied: true }, reason: "paid in cash" });
    expect(rows[7]).toMatchObject({ values: { name: "Friend loan USDT", balance: 40 }, reason: "fully repaid" });
    for (const r of rows) expect(r.actor).toEqual({ kind: "app", userId: "user" });

    const read = await ledger({ record: id });
    expect(read.entries).toHaveLength(8);
    expect(read.entries[0]).toMatchObject({ action: "deleted", record: { type: "liability", id, name: "Friend loan USDT" }, by: { kind: "app" }, reason: "fully repaid" });
  });

  it("names the connected agent that made a change", async () => {
    const { f, ledger } = fixture();
    f.signIn("user|agent-session");
    const { id } = await f.call(upsertAsset, { portfolioId: "pf", name: "Flat", kind: "real_estate", balance: 35000, currency: "EUR", clientMutationId: "a1" });
    await f.call(upsertAsset, { id, portfolioId: "pf", name: "Lisbon flat (cash in)", kind: "real_estate", balance: 35000, currency: "EUR", clientMutationId: "a2", reason: "it is the cash put in" });
    const [rename] = (await ledger({ record: id })).entries;
    expect(rename).toMatchObject({ action: "changed", field: "name", old: "Flat", new: "Lisbon flat (cash in)", by: { kind: "agent", name: "Assistant" }, reason: "it is the cash put in" });
    await f.call(deleteAsset, { id, clientMutationId: "a3" });
    const [gone] = (await ledger({ type: "asset" })).entries;
    expect(gone).toMatchObject({ action: "deleted", record: { id, name: "Lisbon flat (cash in)" }, values: { balance: 35000 }, by: { kind: "agent", name: "Assistant" } });
  });

  it("names the scheduled job when the company portal moves a debt, and records nothing when it doesn't", async () => {
    const { f, ledger } = fixture();
    const { id } = await f.call(upsertLiability, { portfolioId: "pf", name: "Company shortfall", kind: "other", balance: 10, currency: "EUR", clientMutationId: "l1" });
    f.seed("liabilitySources", "src", { portfolioId: "pf", liabilityId: id, url: "https://portal.invalid", createdBy: "user", createdAt: 0 });
    f.signIn(null);
    const reading = { status: "ok", amount: 12.5, currency: "EUR", asOf: 1 };
    await f.call(saveReading, { sourceId: "src", reading, checkedAt: 2 });
    await f.call(saveReading, { sourceId: "src", reading, checkedAt: 3 });
    f.signIn("user");
    const entries = (await ledger({ record: id })).entries;
    expect(entries.map(e => e.action)).toEqual(["changed", "created"]);
    expect(entries[0]).toMatchObject({ field: "balance", old: 10, new: 12.5, by: { kind: "system", name: "Company portal" } });
  });

  it("covers holdings and wallets, and filters by type and time", async () => {
    const { f, history, ledger } = fixture();
    const holding = await f.call(upsertHolding, { portfolioId: "pf", symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: 1, costBasis: 50000, currency: "EUR", acquiredAt: 0, clientMutationId: "h1" });
    await f.call(upsertHolding, { id: holding.id, portfolioId: "pf", symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: 1.5, costBasis: 50000, currency: "EUR", acquiredAt: 0, clientMutationId: "h2" });
    await f.call(deleteHolding, { id: holding.id, clientMutationId: "h3" });
    const wallet = await f.call(addWallet, { portfolioId: "pf", address: "0x000000000000000000000000000000000000dEaD", addressType: "evm", label: "Ledger", includeInNetWorth: true, clientMutationId: "w1" });
    const walletId = typeof wallet === "string" ? wallet : wallet.id;
    f.rows.get(walletId).snapshot = { totalValueUsd: 1 }; // a reading, written by sync, not by a person
    await f.call(updateWallet, { id: walletId, patch: { label: "Ledger Nano" }, clientMutationId: "w2" });
    await f.call(removeWallet, { id: walletId, clientMutationId: "w3" });

    expect((await history({ recordId: holding.id })).reverse().map(r => [r.action, r.field ?? null, r.oldValue ?? null, r.newValue ?? null]))
      .toEqual([["created", null, null, null], ["changed", "quantity", 1, 1.5], ["deleted", null, null, null]]);
    expect((await history({ recordType: "wallet" })).reverse().map(r => [r.action, r.field ?? null])).toEqual([["created", null], ["changed", "label"], ["deleted", null]]);
    expect((await ledger({ type: "holding" })).entries.every(e => e.record.type === "holding")).toBe(true);
    expect((await ledger({ from: "2000-01-01", to: "2000-12-31" })).entries).toEqual([]);
    const all = await history();
    expect((await history({ from: all[0].at, to: all[0].at })).length).toBeGreaterThan(0);
  });

  it("pages without losing changes saved at the same moment", async () => {
    const { f, ledger } = fixture();
    const { id } = await f.call(upsertAsset, { portfolioId: "pf", name: "Cash", kind: "cash", balance: 1, currency: "EUR", clientMutationId: "p1" });
    await f.call(upsertAsset, { id, portfolioId: "pf", name: "Cash EUR", kind: "cash", balance: 2, currency: "EUR", location: "N26", clientMutationId: "p2" });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { entries: any[]; next_cursor: string | null } = await ledger({ limit: 1, ...(cursor ? { cursor } : {}) });
      seen.push(...page.entries.map(e => `${e.action}:${e.field ?? ""}`));
      cursor = page.next_cursor;
    } while (cursor);
    expect(seen.sort()).toEqual(["changed:balance", "changed:location", "changed:name", "created:"]);
  });

  it("refuses a reason longer than 500 characters and keeps nothing", async () => {
    const { f, history } = fixture();
    await expect(f.call(upsertAsset, { portfolioId: "pf", name: "Cash", kind: "cash", balance: 1, currency: "EUR", reason: "x".repeat(501) })).rejects.toThrow(/reason/);
    expect(await history()).toEqual([]);
    expect(f.all("assets")).toEqual([]);
  });

  it("is only readable by members of the space", async () => {
    const { f } = fixture();
    f.seed("portfolios", "other", { name: "Other", ownerId: "someone", defaultCurrency: "EUR", type: "personal" });
    await expect(f.call(list, { portfolioId: "other" })).rejects.toThrow();
  });

  it("goes with the space when the space is deleted", async () => {
    const { f } = fixture();
    f.seed("portfolios", "second", { name: "Second", ownerId: "user", defaultCurrency: "EUR", type: "personal" });
    f.seed("memberships", "mine2", { portfolioId: "second", userId: "user", role: "owner" });
    await f.call(upsertAsset, { portfolioId: "second", name: "Cash", kind: "cash", balance: 1, currency: "EUR", clientMutationId: "s1" });
    expect(f.all("recordChanges").some(r => r.portfolioId === "second")).toBe(true);
    await f.call(removePortfolio, { id: "second", clientMutationId: "s2" });
    expect(f.all("recordChanges").filter(r => r.portfolioId === "second")).toEqual([]);
  });

  it("records a wallet's value when a reading changes it, and nothing for a same or partial reading", async () => {
    const { f, ledger } = fixture();
    const wallet = await f.call(addWallet, { portfolioId: "pf", address: "0x000000000000000000000000000000000000dEaD", addressType: "evm", label: "Ledger", includeInNetWorth: true, clientMutationId: "wv1" });
    const walletId = typeof wallet === "string" ? wallet : wallet.id;
    const reading = (total: number, updatedAt: number, partial = false) => ({
      provider: "public", addressType: "evm", tokenValueUsd: total, defiValueUsd: 0, debtValueUsd: 0, totalValueUsd: total,
      tokens: [], defiPositions: [], chains: ["eth"], failedChains: partial ? ["base"] : [], tokensFetchedAt: updatedAt, updatedAt, partial,
    });
    f.signIn(null);
    await f.call(saveSnapshot, { walletId, snapshot: reading(1000.004, 10) });
    await f.call(saveSnapshot, { walletId, snapshot: reading(1000.001, 11) }); // the same to the cent
    await f.call(saveSnapshot, { walletId, snapshot: reading(400, 12, true) }); // a chain failed: not a value
    await f.call(saveSnapshot, { walletId, snapshot: reading(1250.5, 13) });
    f.signIn("user");
    const entries = (await ledger({ record: walletId })).entries;
    expect(entries.map(e => [e.action, e.field ?? null, e.old ?? null, e.new ?? null])).toEqual([
      ["changed", "value", 1000, 1250.5], ["changed", "value", null, 1000], ["created", null, null, null],
    ]);
    expect(entries[0]).toMatchObject({ values: { currency: "USD" }, by: { kind: "system", name: "Wallet sync" } });
  });

  it("lists deleted records, newest first, with their history still readable", async () => {
    const { f, history } = fixture();
    const asset = await f.call(upsertAsset, { portfolioId: "pf", name: "Old car", kind: "vehicle", balance: 3000, currency: "EUR", clientMutationId: "d1" });
    const debt = await f.call(upsertLiability, { portfolioId: "pf", name: "Car loan", kind: "loan", balance: 900, currency: "EUR", clientMutationId: "d2" });
    await f.call(upsertAsset, { portfolioId: "pf", name: "Kept", kind: "cash", balance: 1, currency: "EUR", clientMutationId: "d3" });
    await f.call(deleteAsset, { id: asset.id, clientMutationId: "d4" });
    await f.call(deleteLiability, { id: debt.id, clientMutationId: "d5" });
    const gone = await f.call(deleted, { portfolioId: "pf" });
    expect(gone.map((r: any) => [r.recordName, r.recordType])).toEqual([["Car loan", "liability"], ["Old car", "asset"]]);
    expect(gone[0].values).toMatchObject({ balance: 900, currency: "EUR" });
    expect((await history({ recordId: debt.id })).map(r => r.action)).toEqual(["deleted", "created"]);
    f.seed("portfolios", "other", { name: "Other", ownerId: "someone", defaultCurrency: "EUR", type: "personal" });
    await expect(f.call(deleted, { portfolioId: "other" })).rejects.toThrow();
  });

  it("backfills one Added entry per existing record, dated when it was made, and adds nothing the second time", async () => {
    const { f } = fixture();
    f.seed("assets", "a-old", { portfolioId: "pf", name: "Flat", kind: "real_estate", balance: 100, currency: "EUR", createdAt: 1_600_000_000_000 });
    f.seed("liabilities", "l-old", { portfolioId: "pf", name: "Card", kind: "credit_card", balance: 5, currency: "EUR" });
    f.seed("holdings", "h-old", { portfolioId: "pf", symbol: "VWCE", name: "World", kind: "etf", quantity: 2, costBasis: 200, currency: "EUR" });
    f.seed("cryptoWallets", "w-old", { portfolioId: "pf", address: "bc1qexample", addressType: "bitcoin", label: "Cold", includeInNetWorth: true, createdAt: 5, updatedAt: 5, snapshot: { totalValueUsd: 42.5, partial: false } });
    const fresh = await f.call(upsertAsset, { portfolioId: "pf", name: "New", kind: "cash", balance: 1, currency: "EUR", clientMutationId: "b1" });
    const run = async () => {
      let added = 0;
      for (const table of ["assets", "liabilities", "holdings", "cryptoWallets"] as const) {
        let cursor: string | null = null;
        do { const page: any = await f.call(backfillPage, { table, cursor }); added += page.added; cursor = page.cursor; } while (cursor !== null);
      }
      return added;
    };
    expect(await run()).toBe(4);
    expect(await run()).toBe(0);
    const created = f.all("recordChanges").filter(r => r.action === "created");
    expect(created).toHaveLength(5);
    expect(created.filter(r => r.recordId === fresh.id)).toHaveLength(1);
    const flat = created.find(r => r.recordId === "a-old")!;
    expect(flat).toMatchObject({ at: 1_600_000_000_000, recordType: "asset", recordName: "Flat", actor: { kind: "system", name: "Backfill" }, values: { balance: 100 } });
    expect(created.find(r => r.recordId === "l-old")!.at).toBe(f.rows.get("l-old")._creationTime);
    expect(created.find(r => r.recordId === "w-old")!).toMatchObject({ recordType: "wallet", recordName: "Cold", values: { value: 42.5, currency: "USD" } });
  });

  it("clears a long history of a deleted space in batches", async () => {
    const { f } = fixture();
    for (let i = 0; i < 1500; i++) f.seed("recordChanges", `old${i}`, { portfolioId: "gone", at: i, recordType: "asset", recordId: "a", recordName: "Cash", action: "created", actor: { kind: "app" } });
    await f.call(purgeSpace, { portfolioId: "gone" });
    expect(f.all("recordChanges").filter(r => r.portfolioId === "gone")).toHaveLength(500);
    expect(f.jobs.filter((j: any) => !j.canceled && j.args?.portfolioId === "gone")).toHaveLength(1);
    await f.call(purgeSpace, { portfolioId: "gone" });
    expect(f.all("recordChanges").filter(r => r.portfolioId === "gone")).toEqual([]);
    expect(f.jobs.filter((j: any) => !j.canceled && j.args?.portfolioId === "gone")).toHaveLength(1);
  });

  it("keeps the history of a space that still exists", async () => {
    const { f } = fixture();
    await f.call(upsertAsset, { portfolioId: "pf", name: "Cash", kind: "cash", balance: 1, currency: "EUR", clientMutationId: "k1" });
    const before = f.all("recordChanges").length;
    await f.call(purgeSpace, { portfolioId: "pf" });
    expect(f.all("recordChanges")).toHaveLength(before);
  });
});
