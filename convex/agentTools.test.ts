// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, AgentInputError, toMs, toolsFor, type AgentIo } from "./lib/agentTools";

const NOW = Date.UTC(2026, 9, 17, 9);
const tool = (name: string) => AGENT_TOOLS.find((t) => t.name === name)!;

function fakeIo(snapshot: Record<string, unknown> = {}) {
  const calls: Array<[string, string, Record<string, unknown>]> = [];
  const spaces = [{ id: "p1", name: "Personal", defaultCurrency: "EUR" }, { id: "p2", name: "Studio", defaultCurrency: "USD" }];
  const io: AgentIo = {
    query: async (path, args) => {
      calls.push(["query", path, args]);
      if (path === "spaces:listMine") return spaces;
      if (path === "cryptoWallets:listForPortfolio") return [];
      if (path === "mobile:portfolioSnapshot") return snapshot;
      throw new Error(`unexpected ${path}`);
    },
    mutation: async (path, args) => {
      calls.push(["mutation", path, args]);
      if (path === "mobile:bootstrap") return { selectedPortfolioId: "p1" };
      return { id: "new", replayed: false };
    },
    action: async (path, args) => { calls.push(["action", path, args]); return { status: "ok" }; },
    requestId: (given) => given === undefined ? "req-1" : `scoped:${given}`,
    now: () => NOW,
  };
  return { io, calls, writes: () => calls.filter(([kind, path]) => kind !== "query" && path !== "mobile:bootstrap") };
}

describe("agent tools", () => {
  it("offers every tool to a full connection and only reading tools to a read-only one", () => {
    expect(toolsFor("full").length).toBe(AGENT_TOOLS.length);
    expect(toolsFor("read").map((t) => t.name)).toEqual(["get_overview", "list_spaces", "get_records", "list_transactions", "get_history"]);
    expect(new Set(AGENT_TOOLS.map((t) => t.name)).size).toBe(AGENT_TOOLS.length);
    for (const t of AGENT_TOOLS) expect(t.inputSchema.additionalProperties).toBe(false);
  });

  it("adds spending to the open space in its currency, today, with a receipt id", async () => {
    const f = fakeIo();
    await tool("add_transaction").run(f.io, { kind: "expense", amount: 24, description: "Lunch" });
    expect(f.writes()).toEqual([["mutation", "mobile:createTransaction", { portfolioId: "p1", kind: "expense", amount: 24, currency: "EUR", description: "Lunch", occurredAt: NOW, clientMutationId: "req-1" }]]);
  });

  it("keeps a trimmed note with a transaction, can clear it, and refuses one that is too long", async () => {
    const f = fakeIo();
    await tool("add_transaction").run(f.io, { kind: "expense", amount: 9.99, description: "Tesla", notes: "  card •1234 · Lisbon  " });
    await tool("add_transaction").run(f.io, { kind: "expense", amount: 1, description: "Coffee", notes: "   " });
    await tool("update_transaction").run(f.io, { id: "t1", notes: null });
    await tool("update_transaction").run(f.io, { id: "t2", notes: "Shared with Ana" });
    await tool("update_transaction").run(f.io, { id: "t3", amount: 5 });
    expect(f.writes()[0][2]).toMatchObject({ notes: "card •1234 · Lisbon" });
    expect("notes" in (f.writes()[1][2] as object)).toBe(false);
    expect(f.writes()[2][2]).toMatchObject({ id: "t1", notes: null });
    expect(f.writes()[3][2]).toMatchObject({ id: "t2", notes: "Shared with Ana" });
    expect("notes" in (f.writes()[4][2] as object)).toBe(false);
    await expect(tool("add_transaction").run(f.io, { kind: "expense", amount: 1, description: "x", notes: "a".repeat(501) })).rejects.toThrow(AgentInputError);
  });

  it("adds a category once, after the last one, and reuses a name the space already has", async () => {
    const f = fakeIo();
    const query = f.io.query;
    f.io.query = async (path, args) => path === "categories:listForPortfolio"
      ? [{ _id: "c1", name: "Groceries", kind: "expense", sortOrder: 0 }, { _id: "c2", name: "Salary", kind: "income", sortOrder: 6 }]
      : query(path, args);
    const made = await tool("save_category").run(f.io, { name: " Travel ", emoji: "✈️", icon: "plane", color: "sky", request_id: "cat-travel" });
    expect(made).toEqual({ id: "new", replayed: false });
    expect(f.writes()).toEqual([["mutation", "categories:add", { portfolioId: "p1", name: "Travel", kind: "expense", icon: "plane", color: "sky", emoji: "✈️", sortOrder: 7, clientMutationId: "scoped:cat-travel" }]]);
    expect(await tool("save_category").run(f.io, { name: "groceries" })).toEqual({ id: "c1", replayed: true, existing: true });
    await tool("save_category").run(f.io, { name: "Groceries", kind: "income" });
    expect(f.writes()[1][2]).toMatchObject({ name: "Groceries", kind: "income", icon: "tag", color: "sand", sortOrder: 7 });
    await expect(tool("save_category").run(f.io, {})).rejects.toThrow(AgentInputError);
    await expect(tool("save_category").run(f.io, { name: "x".repeat(41) })).rejects.toThrow(AgentInputError);
  });

  it("renames or restyles a category by id and refuses an empty change", async () => {
    const f = fakeIo();
    await tool("save_category").run(f.io, { id: "c9", name: "Trips", emoji: "🧳" });
    expect(f.writes()).toEqual([["mutation", "categories:update", { id: "c9", patch: { name: "Trips", emoji: "🧳" }, clientMutationId: "req-1" }]]);
    await expect(tool("save_category").run(f.io, { id: "c9" })).rejects.toThrow(AgentInputError);
  });

  it("uses the agent's own request id, so a retried call saves once", async () => {
    const f = fakeIo();
    await tool("save_asset").run(f.io, { space_id: "p2", name: "Chase", kind: "cash", balance: "1200.50", request_id: "same-id" });
    expect(f.writes()[0][2]).toMatchObject({ portfolioId: "p2", balance: 1200.5, currency: "USD", clientMutationId: "scoped:same-id" });
  });

  it("passes where a holding is kept only when the agent says it", async () => {
    const f = fakeIo();
    const base = { symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: 0.1, cost_basis: 5000 };
    await tool("save_holding").run(f.io, { ...base, location: "Ledger" });
    await tool("save_holding").run(f.io, { ...base, id: "h1" });
    expect(f.writes()[0][2]).toMatchObject({ location: "Ledger" });
    expect("location" in (f.writes()[1][2] as object)).toBe(false);
  });

  it("passes what an asset cost and when it was bought only when the agent says it, and 0 clears the cost", async () => {
    const f = fakeIo();
    const watch = { name: "Watch", kind: "collectible", balance: 12000 };
    await tool("save_asset").run(f.io, { ...watch, cost_basis: 11000, acquired_at: "2025-02-01" });
    await tool("save_asset").run(f.io, { ...watch, id: "a1" });
    await tool("save_asset").run(f.io, { ...watch, id: "a1", cost_basis: 0 });
    expect(f.writes()[0][2]).toMatchObject({ costBasis: 11000, acquiredAt: Date.parse("2025-02-01T12:00:00Z") });
    expect("costBasis" in (f.writes()[1][2] as object) || "acquiredAt" in (f.writes()[1][2] as object)).toBe(false);
    expect(f.writes()[2][2]).toMatchObject({ costBasis: null });
  });

  it("records a debt owed in an asset with its quantity", async () => {
    const f = fakeIo();
    await tool("save_liability").run(f.io, { name: "Razmik", kind: "other", balance: 12000, currency: "USD", owed_asset: "BTC", owed_quantity: 0.15 });
    expect(f.writes()[0][2]).toMatchObject({ name: "Razmik", owedSymbol: "BTC", owedQuantity: 0.15, balance: 12000, currency: "USD" });
  });

  it("turns a plain date into midday UTC so it stays on that day", () => {
    expect(new Date(toMs("2026-10-01", "date")).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(toMs("2026-10-01T08:30:00Z", "date")).toBe(Date.UTC(2026, 9, 1, 8, 30));
    expect(() => toMs("yesterday", "date")).toThrow(AgentInputError);
  });

  it("refuses bad input with a message the agent can act on", async () => {
    const f = fakeIo();
    await expect(tool("add_transaction").run(f.io, { kind: "gift", amount: 5, description: "x" })).rejects.toThrow("kind must be one of income, expense");
    await expect(tool("add_transaction").run(f.io, { kind: "income", description: "x" })).rejects.toThrow("amount is required");
    await expect(tool("save_asset").run(f.io, { space_id: "nope", name: "x", kind: "cash", balance: 1 })).rejects.toThrow("No space with id nope");
    expect(f.writes()).toEqual([]);
  });

  it("changes only the transaction fields sent, and can clear a category", async () => {
    const f = fakeIo();
    await tool("update_transaction").run(f.io, { id: "t1", amount: 30, category_id: null });
    expect(f.writes()).toEqual([["mutation", "mobile:updateTransaction", { id: "t1", amount: 30, categoryId: null, clientMutationId: "req-1" }]]);
  });

  it("filters transactions by whole days and category, newest first as stored", async () => {
    const day = (d: number, h = 12) => Date.UTC(2026, 9, d, h);
    const f = fakeIo({ transactions: [
      { id: "a", occurredAt: day(31, 23), categoryId: "food" }, { id: "b", occurredAt: day(15), categoryId: "food" },
      { id: "c", occurredAt: day(15), categoryId: "rent" }, { id: "d", occurredAt: day(1, 0), categoryId: "food" }, { id: "e", occurredAt: Date.UTC(2026, 8, 30, 12), categoryId: "food" },
    ] });
    const out = (await tool("list_transactions").run(f.io, { from: "2026-10-01", to: "2026-10-31", category_id: "food" })) as { total: number; transactions: Array<{ id: string }> };
    expect(out.transactions.map((t) => t.id)).toEqual(["a", "b", "d"]);
  });

  it("checks a new wallet right away and reports the result", async () => {
    const f = fakeIo();
    const out = await tool("track_wallet").run(f.io, { address: "0xabc", address_type: "evm", label: "Main" });
    expect(f.writes().map(([, path]) => path)).toEqual(["cryptoWallets:add", "walletSync:refresh"]);
    expect(f.writes()[0][2]).toMatchObject({ includeInNetWorth: true });
    expect(out).toEqual({ id: "new", first_check: { status: "ok" } });
  });

  it("gives an overview with totals, this month and wallets kept apart in dollars", async () => {
    const f = fakeIo({
      dashboard: { currency: "EUR", netWorth: 1000, liquid: 400, invested: 500, hardAssets: 200, liabilities: 100, monthIncome: 50, monthExpenses: 20, monthCashflow: 30 },
      assets: [{}], liabilities: [], holdings: [{}, {}], transactions: [], goals: [], wealthSnapshots: [{ takenAt: 1, netWorth: 900 }],
    });
    const out = (await tool("get_overview").run(f.io, {})) as Record<string, unknown>;
    expect(out).toMatchObject({ space: { id: "p1", currency: "EUR" }, totals: { net_worth: 1000, owed: 100 }, this_month: { kept: 30 }, counts: { holdings: 2 }, latest_history_point: { netWorth: 900 } });
  });

  it("links a loan to where its money went as typed targets, with a receipt id", async () => {
    const f = fakeIo();
    await tool("link_loan").run(f.io, { loan: "liability:l1", went_to: ["holding:h1"], backed_by: ["asset:a1"] });
    expect(f.writes()).toEqual([["mutation", "loanLinks:set", { portfolioId: "p1", loanKey: "liability:l1", targets: [{ key: "holding:h1", role: "deployed" }, { key: "asset:a1", role: "collateral" }], clientMutationId: "req-1" }]]);
    await expect(tool("link_loan").run(f.io, { loan: "liability:l1", went_to: "holding:h1" })).rejects.toThrow(AgentInputError);
  });

  it("records debt history and who a debt is with", async () => {
    const f = fakeIo();
    await tool("record_debt_event").run(f.io, { debt: "liability:l1", kind: "repaid", amount: 5000, unit: "EUR", date: "2026-09-20", note: "Paid to Liza", apply: true });
    await tool("save_liability").run(f.io, { id: "l1", name: "Stas", kind: "other", balance: 19670, who: "Stas" });
    expect(f.writes().map(([, path, args]) => [path, args])).toEqual([
      ["debtEvents:add", { portfolioId: "p1", subject: "liability:l1", kind: "repaid", amount: 5000, unit: "EUR", occurredAt: Date.UTC(2026, 8, 20, 12), note: "Paid to Liza", apply: true, clientMutationId: "req-1" }],
      ["mobile:upsertLiability", expect.objectContaining({ id: "l1", counterparty: "Stas" })],
    ]);
  });
});
