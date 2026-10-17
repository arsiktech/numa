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

  it("uses the agent's own request id, so a retried call saves once", async () => {
    const f = fakeIo();
    await tool("save_asset").run(f.io, { space_id: "p2", name: "Chase", kind: "cash", balance: "1200.50", request_id: "same-id" });
    expect(f.writes()[0][2]).toMatchObject({ portfolioId: "p2", balance: 1200.5, currency: "USD", clientMutationId: "scoped:same-id" });
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
});
