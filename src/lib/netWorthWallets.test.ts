import { expect, it } from "vitest";
import { fromSnapshot } from "../../apps/numa/src/data/fromSnapshot";
import { summarize } from "../../apps/numa/src/domain/summary";
import type { CloudSnapshot, CloudWallet } from "../../apps/numa/src/cloud/api";
import { AGENT_TOOLS, type AgentIo } from "../../convex/lib/agentTools";
import { portfolioSnapshot } from "../../convex/mobile";
import { buildAutoSnapshot } from "./autoSnapshot";
import type { Asset, CryptoWallet, Liability, Portfolio } from "./types";

/**
 * One euro space, four tracked wallets and ordinary accounts.
 * 1 EUR = 1.25 USD.
 * Cash 1,500 EUR + 250 USD (= 200 EUR) + a flat of 8,000 EUR − a 500 EUR loan.
 * Ledger: 2,500 USD of coins, counted.
 * DeFi: 1,250 USD net and 500 USD borrowed, partial and a day old, still counted
 *   (owned 1,400 EUR, owed 400 EUR).
 * Waiting: counted, but never checked — left out, not zero.
 * Left out: checked, but not counted in net worth.
 * Home, the overview and the history point must all read 12,200 EUR net,
 * 5,100 EUR liquid and 900 EUR owed.
 */
const NOW = Date.UTC(2026, 9, 12, 12);
const RATE = 1.25;

function fixture() {
  const rows = new Map<string, any>();
  const tables = new Map<string, string>();
  const seed = (table: string, id: string, value: object) => {
    rows.set(id, { _id: id, ...value });
    tables.set(id, table);
  };
  seed("users", "user", { email: "synthetic@example.com" });
  seed("memberships", "member", { userId: "user", portfolioId: "home", role: "owner" });
  seed("portfolios", "home", { name: "Personal", type: "personal", defaultCurrency: "EUR", tagline: "", ownerId: "user", createdAt: 0 });
  seed("priceHistory", "fx", { key: "fx:EURUSD", p: [RATE], t: [NOW] });
  seed("assets", "bank", { portfolioId: "home", kind: "cash", name: "Bank", balance: 1500, currency: "EUR", updatedAt: NOW });
  seed("assets", "dollars", { portfolioId: "home", kind: "cash", name: "Dollar account", balance: 250, currency: "USD", updatedAt: NOW });
  seed("assets", "flat", { portfolioId: "home", kind: "real_estate", name: "Flat", balance: 8000, currency: "EUR", updatedAt: NOW });
  seed("liabilities", "loan", { portfolioId: "home", kind: "loan", name: "Loan", balance: 500, currency: "EUR", updatedAt: NOW });
  const wallet = (id: string, value: object) => seed("cryptoWallets", id, { portfolioId: "home", addressType: "bitcoin", createdAt: 0, ...value });
  const checked = (totalValueUsd: number, debtValueUsd: number, updatedAt: number, partial: boolean) => ({
    totalValueUsd, debtValueUsd, updatedAt, partial, provider: "public", chains: ["bitcoin"], failedChains: [], tokens: []
  });
  wallet("ledger", { label: "Ledger", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", includeInNetWorth: true, snapshot: checked(2500, 0, NOW - 60_000, false) });
  wallet("defi", { label: "DeFi", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", addressType: "evm", includeInNetWorth: true, snapshot: checked(1250, 500, NOW - 26 * 3_600_000, true) });
  wallet("waiting", { label: "Waiting", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", includeInNetWorth: true });
  wallet("aside", { label: "Left out", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", includeInNetWorth: false, snapshot: checked(9999, 0, NOW, false) });
  const db = {
    get: async (id: string) => rows.has(id) ? { ...rows.get(id) } : null,
    query: (table: string) => {
      const predicates: Array<(row: any) => boolean> = [];
      const collect = async () => [...rows].filter(([id, row]) => tables.get(id) === table && predicates.every((p) => p(row))).map(([, row]) => ({ ...row }));
      const query = {
        withIndex: (_index: string, callback: any) => {
          const builder = { eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return builder; } };
          callback(builder);
          return query;
        },
        filter: (callback: any) => {
          predicates.push(callback({ field: (key: string) => key, eq: (key: string, value: unknown) => (row: any) => row[key] === value }));
          return query;
        },
        collect,
        unique: async () => {
          const values = await collect();
          if (values.length > 1) throw new Error("Not unique");
          return values[0] ?? null;
        }
      };
      return query;
    }
  };
  const ctx = { db, auth: { getUserIdentity: async () => ({ subject: "user" }) } };
  return { rows, call: (fn: { _handler: (ctx: unknown, args: object) => Promise<unknown> }, args: object) => fn._handler(ctx, args) };
}

function cloudWallet(row: any): CloudWallet {
  return {
    id: row._id, label: row.label, address: row.address, addressType: row.addressType, includeInNetWorth: row.includeInNetWorth, createdAt: 0,
    snapshot: row.snapshot ?? null
  };
}

it("counts tracked wallets the same way in the overview, a history point and the home total", async () => {
  const f = fixture();
  const snap = await f.call(portfolioSnapshot, { portfolioId: "home" }) as {
    dashboard: { currency: string; netWorth: number; liquid: number; invested: number; hardAssets: number; liabilities: number; monthIncome: number; monthExpenses: number; monthCashflow: number };
    assets: unknown[]; liabilities: unknown[]; holdings: unknown[]; transactions: unknown[]; goals: unknown[]; wealthSnapshots: unknown[];
  };
  const wallets = [...f.rows].filter(([id]) => id === "ledger" || id === "defi" || id === "waiting" || id === "aside").map(([, row]) => row);
  const home = fromSnapshot({
    portfolio: { id: "home", name: "Personal", defaultCurrency: "EUR" },
    categories: [], transactions: [], holdings: [], wealthSnapshots: [],
    assets: [
      { id: "bank", name: "Bank", kind: "cash", balance: 1500, currency: "EUR", updatedAt: NOW },
      { id: "dollars", name: "Dollar account", kind: "cash", balance: 250, currency: "USD", updatedAt: NOW },
      { id: "flat", name: "Flat", kind: "real_estate", balance: 8000, currency: "EUR", updatedAt: NOW }
    ],
    liabilities: [{ id: "loan", name: "Loan", kind: "loan", balance: 500, currency: "EUR", dueDate: null, updatedAt: NOW }],
    wallets: wallets.map(cloudWallet)
  } as CloudSnapshot, { usdPerEur: RATE, asOf: "2026-10-11" }, new Date(NOW));
  const summary = summarize(home.holdings, home.debts, new Date(NOW));
  const point = buildAutoSnapshot({
    portfolio: { defaultCurrency: "EUR" } as Portfolio,
    assets: [
      { kind: "cash", balance: 1500, currency: "EUR" },
      { kind: "cash", balance: 250, currency: "USD" },
      { kind: "real_estate", balance: 8000, currency: "EUR" }
    ] as Asset[],
    holdings: [],
    liabilities: [{ balance: 500, currency: "EUR" }] as Liability[],
    cryptoWallets: wallets as CryptoWallet[]
  }, {}, { EUR: 1, USD: RATE }, NOW);

  expect(home.unconverted).toEqual([]);
  expect(summary).toMatchObject({ netCents: 1_220_000, liquidCents: 510_000, oweCents: 90_000 });
  expect(summary.ownCents - summary.liquidCents).toBe(800_000);
  expect(snap.dashboard).toMatchObject({ currency: "EUR", netWorth: 12200, liquid: 5100, invested: 0, hardAssets: 8000, liabilities: 900 });
  expect(snap.dashboard.netWorth * 100).toBe(summary.netCents);
  expect(snap.dashboard.liquid * 100).toBe(summary.liquidCents);
  expect(snap.dashboard.liabilities * 100).toBe(summary.oweCents);
  expect(snap.dashboard.hardAssets * 100).toBe(summary.ownCents - summary.liquidCents);
  expect(point).toMatchObject({
    netWorth: snap.dashboard.netWorth,
    liquid: snap.dashboard.liquid,
    invested: snap.dashboard.invested,
    hardAssets: snap.dashboard.hardAssets,
    liabilities: snap.dashboard.liabilities,
    currency: "EUR"
  });

  const tool = AGENT_TOOLS.find((item) => item.name === "get_overview")!;
  const io: AgentIo = {
    query: async (path) => {
      if (path === "spaces:listMine") return [{ id: "home", name: "Personal", defaultCurrency: "EUR" }];
      if (path === "mobile:portfolioSnapshot") return snap;
      if (path === "cryptoWallets:listForPortfolio") return wallets;
      throw new Error(path);
    },
    mutation: async (path) => { throw new Error(`overview does not write ${path}`); },
    action: async (path) => { throw new Error(`overview does not act ${path}`); },
    requestId: () => "req",
    now: () => NOW
  };
  const overview = await tool.run(io, { space_id: "home" }) as {
    totals: { net_worth: number; liquid: number; invested: number; hard_assets: number; owed: number };
    note: string; wallets: unknown[];
  };
  expect(overview.totals).toEqual({ net_worth: 12200, liquid: 5100, invested: 0, hard_assets: 8000, owed: 900 });
  expect(overview.totals.net_worth).toBe(summary.netCents / 100);
  expect(overview.totals.liquid).toBe(summary.liquidCents / 100);
  expect(overview.totals.owed).toBe(summary.oweCents / 100);
  expect(overview.totals).toEqual({
    net_worth: point!.netWorth, liquid: point!.liquid, invested: point!.invested, hard_assets: point!.hardAssets, owed: point!.liabilities
  });
  expect(overview.wallets).toHaveLength(4);
  expect(overview.note).toContain("already include");
  expect(overview.note).not.toContain("do not include tracked wallets");
});
