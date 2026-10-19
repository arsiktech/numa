/**
 * The tools a connected agent can use, as MCP tool definitions. Each tool calls
 * the same public Convex functions the app calls, as the user, so every check
 * on membership, money, currency and receipts applies to agents unchanged.
 * Nothing here talks to the network directly: `AgentIo` is supplied by the
 * HTTP endpoint (or by a test).
 */

export type AgentAccess = "full" | "read";

export type AgentIo = {
  query: (path: string, args: Record<string, unknown>) => Promise<unknown>;
  mutation: (path: string, args: Record<string, unknown>) => Promise<unknown>;
  action: (path: string, args: Record<string, unknown>) => Promise<unknown>;
  /**
   * The receipt id for a write. With the agent's own request id it is the same on a retry, so the
   * write saves once; without one it is fresh. Either way it is unique to this connection and tool.
   */
  requestId: (given?: string) => string;
  now: () => number;
};

type Json = Record<string, unknown>;
type Schema = { type: "object"; properties: Record<string, Json>; required?: string[]; additionalProperties: false };

export type AgentTool = {
  name: string;
  title: string;
  description: string;
  write: boolean;
  inputSchema: Schema;
  run: (io: AgentIo, args: Json) => Promise<unknown>;
};

/** A mistake in what the agent sent: reported back to it as a tool error, never as a server failure. */
export class AgentInputError extends Error {}

const CURRENCIES = ["EUR", "USD"] as const;
const str = (description: string, extra: Json = {}): Json => ({ type: "string", description, ...extra });
const num = (description: string, extra: Json = {}): Json => ({ type: "number", description, ...extra });
const spaceId = str("Space (portfolio) id from list_spaces. Leave out to use the space the user has open.");
const currency = str("Currency code. Leave out to use the space's currency.", { enum: [...CURRENCIES] });
const requestId = str("Optional id for this write. Sending the same id again never saves twice.");
const where = str("Where it is kept, like Trade Republic, Ledger or Binance. Leave out to keep what is saved; send an empty string to clear it.");
/** `location` only when the agent sent it, so an update without it keeps the saved place. */
const place = (args: Json) => (typeof args.location === "string" ? { location: args.location } : {});
const schema = (properties: Record<string, Json>, required: string[] = []): Schema =>
  ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false });

function text(args: Json, key: string, required = true): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new AgentInputError(`${key} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new AgentInputError(`${key} must be text`);
  return value;
}

function amount(args: Json, key: string, required = true): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) throw new AgentInputError(`${key} is required`);
    return undefined;
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new AgentInputError(`${key} must be a number`);
  return n;
}

/** "2026-10-17" or a full ISO time → milliseconds. A bare date means midday UTC, so it stays on that day everywhere. */
export function toMs(value: unknown, key: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") throw new AgentInputError(`${key} must be a date like 2026-10-17`);
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(ms)) throw new AgentInputError(`${key} must be a date like 2026-10-17`);
  return ms;
}

const date = (args: Json, key: string, fallback?: number) =>
  args[key] === undefined || args[key] === null ? fallback : toMs(args[key], key);

function oneOf<T extends string>(args: Json, key: string, options: readonly T[], required = true): T | undefined {
  const value = text(args, key, required);
  if (value === undefined) return undefined;
  if (!options.includes(value as T)) throw new AgentInputError(`${key} must be one of ${options.join(", ")}`);
  return value as T;
}

type Space = { id: string; currency: string; name: string };
type SpaceRow = { id: string; name: string; defaultCurrency: string };

async function resolveSpace(io: AgentIo, args: Json): Promise<Space> {
  const wanted = text(args, "space_id", false);
  const spaces = (await io.query("spaces:listMine", {})) as SpaceRow[];
  let id = wanted;
  if (!id) {
    const boot = (await io.mutation("mobile:bootstrap", {})) as { selectedPortfolioId: string | null };
    id = boot.selectedPortfolioId ?? spaces[0]?.id;
  }
  const space = spaces.find((s) => s.id === id);
  if (!space) throw new AgentInputError(wanted ? `No space with id ${wanted}. Use list_spaces.` : "This account has no space yet. Open Numa Pro once to create one.");
  return { id: space.id, currency: space.defaultCurrency, name: space.name };
}

function write(io: AgentIo, args: Json) {
  const given = text(args, "request_id", false);
  if (given !== undefined && given.length > 80) throw new AgentInputError("request_id must be at most 80 characters");
  return { clientMutationId: io.requestId(given) };
}

type Snapshot = {
  portfolio: Json;
  dashboard: Json & { currency: string; netWorth: number; liquid: number; invested: number; hardAssets: number; liabilities: number; monthIncome: number; monthExpenses: number; monthCashflow: number };
  transactions: Array<Json & { occurredAt: number; categoryId?: string | null }>;
  categories: Json[];
  assets: Json[];
  liabilities: Json[];
  holdings: Json[];
  goals: Json[];
  recurring: Json[];
  revenue: unknown;
  wealthSnapshots: Array<Json & { takenAt: number }>;
};

type WalletDoc = { _id: string; label: string; address: string; addressType: string; includeInNetWorth: boolean;
  snapshot?: { totalValueUsd: number; debtValueUsd?: number; tokens: Json[]; defiPositions?: Json[]; failedChains: string[]; updatedAt: number; partial: boolean } };

const iso = (ms: number | undefined | null) => (typeof ms === "number" ? new Date(ms).toISOString() : null);

function walletSummary(w: WalletDoc, detail: boolean) {
  const s = w.snapshot;
  return {
    id: w._id, label: w.label, address: w.address, type: w.addressType, counted_in_net_worth: w.includeInNetWorth,
    value_usd: s ? s.totalValueUsd : null, borrowed_usd: s?.debtValueUsd ?? 0,
    checked_at: iso(s?.updatedAt), incomplete: s ? s.partial : null, unreachable_chains: s?.failedChains ?? [],
    ...(detail && s ? { tokens: s.tokens, lending: s.defiPositions ?? [] } : {}),
  };
}

const snapshotOf = (io: AgentIo, space: Space) => io.query("mobile:portfolioSnapshot", { portfolioId: space.id }) as Promise<Snapshot>;
const walletsOf = (io: AgentIo, space: Space) => io.query("cryptoWallets:listForPortfolio", { portfolioId: space.id }) as Promise<WalletDoc[]>;

const SECTIONS = ["assets", "liabilities", "holdings", "goals", "categories", "recurring", "revenue", "wallets"] as const;

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_overview", title: "Overview", write: false,
    description: "Start here. Net worth and its parts for a space, this month's income and spending, tracked wallets, goals and the latest saved history point. Amounts are in the space currency unless named _usd.",
    inputSchema: schema({ space_id: spaceId }),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const [snap, wallets] = await Promise.all([snapshotOf(io, space), walletsOf(io, space)]);
      const d = snap.dashboard;
      const last = snap.wealthSnapshots[snap.wealthSnapshots.length - 1];
      return {
        space: { id: space.id, name: space.name, currency: d.currency },
        as_of: iso(io.now()),
        totals: { net_worth: d.netWorth, liquid: d.liquid, invested: d.invested, hard_assets: d.hardAssets, owed: d.liabilities },
        this_month: { income: d.monthIncome, spending: d.monthExpenses, kept: d.monthCashflow },
        note: "totals do not include tracked wallets; each wallet's value is listed in US dollars under wallets.",
        wallets: wallets.map((w) => walletSummary(w, false)),
        counts: { assets: snap.assets.length, liabilities: snap.liabilities.length, holdings: snap.holdings.length, transactions: snap.transactions.length, goals: snap.goals.length },
        goals: snap.goals,
        latest_history_point: last ?? null,
      };
    },
  },
  {
    name: "list_spaces", title: "List spaces", write: false,
    description: "The user's spaces (personal and business portfolios), each with its own currency and records.",
    inputSchema: schema({}),
    run: (io) => io.query("spaces:listMine", {}),
  },
  {
    name: "get_records", title: "Get records", write: false,
    description: "Everything recorded in a space: assets (cash and property), liabilities, holdings (stocks, funds, crypto) with live values, goals, categories with spending limits, recurring income, business revenue and wallets with their tokens and lending. Use sections to fetch only some.",
    inputSchema: schema({ space_id: spaceId, sections: { type: "array", items: { type: "string", enum: [...SECTIONS] }, description: "Which parts to return. Leave out for all." } }),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const want = Array.isArray(args.sections) && args.sections.length ? new Set(args.sections as string[]) : new Set<string>(SECTIONS);
      const snap = await snapshotOf(io, space);
      const out: Json = { space: { id: space.id, name: space.name, currency: space.currency } };
      for (const key of SECTIONS) {
        if (!want.has(key)) continue;
        out[key] = key === "wallets" ? (await walletsOf(io, space)).map((w) => walletSummary(w, true)) : snap[key];
      }
      return out;
    },
  },
  {
    name: "list_transactions", title: "List transactions", write: false,
    description: "Income and spending in a space, newest first. Filter by date range and category.",
    inputSchema: schema({ space_id: spaceId, from: str("First day, like 2026-10-01."), to: str("Last day, like 2026-10-31."), category_id: str("Only this category."), limit: num("At most this many, up to 500. Default 100.", { minimum: 1, maximum: 500 }) }),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const from = date(args, "from"), to = date(args, "to");
      const end = to === undefined ? undefined : (typeof args.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.to) ? to + 12 * 3_600_000 : to);
      const start = from === undefined ? undefined : (typeof args.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.from) ? from - 12 * 3_600_000 : from);
      const category = text(args, "category_id", false);
      const limit = Math.min(500, Math.max(1, Math.floor(amount(args, "limit", false) ?? 100)));
      const snap = await snapshotOf(io, space);
      const rows = snap.transactions.filter((t) => (start === undefined || t.occurredAt >= start) && (end === undefined || t.occurredAt < end) && (!category || t.categoryId === category));
      return { space: { id: space.id, currency: space.currency }, total: rows.length, transactions: rows.slice(0, limit) };
    },
  },
  {
    name: "get_history", title: "Net worth history", write: false,
    description: "Saved net worth over time, oldest first, each point split into liquid, invested, hard assets and owed, with positions where they were saved.",
    inputSchema: schema({ space_id: spaceId, from: str("First day, like 2025-01-01."), to: str("Last day.") }),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const from = date(args, "from"), to = date(args, "to");
      const snap = await snapshotOf(io, space);
      return { space: { id: space.id, currency: space.currency }, points: snap.wealthSnapshots.filter((p) => (from === undefined || p.takenAt >= from - 12 * 3_600_000) && (to === undefined || p.takenAt <= to + 12 * 3_600_000)) };
    },
  },
  {
    name: "add_transaction", title: "Add income or spending", write: true,
    description: "Record money that came in or went out. Amount is always positive; kind says the direction.",
    inputSchema: schema({ space_id: spaceId, kind: str("income or expense", { enum: ["income", "expense"] }), amount: num("Positive amount.", { exclusiveMinimum: 0 }), currency, description: str("What it was, like Lunch or Salary."), date: str("When, like 2026-10-17. Default now."), category_id: str("Category id from get_records."), request_id: requestId }, ["kind", "amount", "description"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      return io.mutation("mobile:createTransaction", {
        portfolioId: space.id, kind: oneOf(args, "kind", ["income", "expense"] as const), amount: amount(args, "amount"),
        currency: oneOf(args, "currency", CURRENCIES, false) ?? space.currency, description: text(args, "description"),
        occurredAt: date(args, "date", io.now()), ...(text(args, "category_id", false) ? { categoryId: text(args, "category_id") } : {}), ...write(io, args),
      });
    },
  },
  {
    name: "update_transaction", title: "Change a transaction", write: true,
    description: "Change any field of a transaction. Only the fields you send change.",
    inputSchema: schema({ id: str("Transaction id."), kind: str("income or expense", { enum: ["income", "expense"] }), amount: num("Positive amount.", { exclusiveMinimum: 0 }), currency: str("Currency code.", { enum: [...CURRENCIES] }), description: str("New description."), date: str("New date."), category_id: { type: ["string", "null"], description: "New category id, or null for none." }, request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("mobile:updateTransaction", {
      id: text(args, "id"),
      ...(args.kind !== undefined ? { kind: oneOf(args, "kind", ["income", "expense"] as const) } : {}),
      ...(args.amount !== undefined ? { amount: amount(args, "amount") } : {}),
      ...(args.currency !== undefined ? { currency: oneOf(args, "currency", CURRENCIES) } : {}),
      ...(args.description !== undefined ? { description: text(args, "description") } : {}),
      ...(args.date !== undefined ? { occurredAt: date(args, "date") } : {}),
      ...(args.category_id !== undefined ? { categoryId: args.category_id === null ? null : text(args, "category_id") } : {}),
      ...write(io, args),
    }),
  },
  {
    name: "delete_transaction", title: "Delete a transaction", write: true,
    description: "Delete one transaction.",
    inputSchema: schema({ id: str("Transaction id."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("mobile:deleteTransaction", { id: text(args, "id"), ...write(io, args) }),
  },
  {
    name: "save_asset", title: "Add or update an asset", write: true,
    description: "Cash accounts, property, vehicles, collectibles. Send id to update an existing one; leave it out to add a new one. cost_basis and acquired_at show how much it gained or lost since it was bought.",
    inputSchema: schema({ id: str("Asset id to update."), space_id: spaceId, name: str("Name, like Revolut EUR or Flat in Lisbon."), kind: str("Kind of asset.", { enum: ["cash", "real_estate", "vehicle", "collectible", "other"] }), balance: num("Current value."), currency, location: where, cost_basis: num("What it cost in total, in the same currency, to show its gain or loss. 0 clears it.", { minimum: 0 }), acquired_at: str("When it was bought, like 2025-02-01."), request_id: requestId }, ["name", "kind", "balance"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const cost = args.cost_basis === undefined || args.cost_basis === null ? undefined : amount(args, "cost_basis");
      return io.mutation("mobile:upsertAsset", {
        ...(cost === undefined ? {} : { costBasis: cost > 0 ? cost : null }), ...(args.acquired_at === undefined ? {} : { acquiredAt: date(args, "acquired_at") ?? null }),
        ...(text(args, "id", false) ? { id: text(args, "id") } : {}), portfolioId: space.id, name: text(args, "name"),
        kind: oneOf(args, "kind", ["cash", "real_estate", "vehicle", "collectible", "other"] as const), balance: amount(args, "balance"),
        currency: oneOf(args, "currency", CURRENCIES, false) ?? space.currency, ...place(args), ...write(io, args),
      });
    },
  },
  {
    name: "delete_asset", title: "Delete an asset", write: true,
    description: "Delete one asset.",
    inputSchema: schema({ id: str("Asset id."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("mobile:deleteAsset", { id: text(args, "id"), ...write(io, args) }),
  },
  {
    name: "save_liability", title: "Add or update a debt", write: true,
    description: "Credit cards, loans, mortgages and other money owed. Balance is the amount owed, positive. A debt owed in an asset (like 0.15 BTC or 26,800 USDC) also sends owed_asset and owed_quantity; Numa then values it at that asset's live price. Send id to update.",
    inputSchema: schema({ id: str("Liability id to update."), space_id: spaceId, name: str("Name, like Car loan."), kind: str("Kind of debt.", { enum: ["credit_card", "loan", "mortgage", "other"] }), balance: num("Amount owed, in currency. For a debt owed in an asset, today's value.", { minimum: 0 }), currency, due_date: str("Next due date, like 2026-11-01."), owed_asset: str("Asset the debt is owed in, when not money.", { enum: ["BTC", "ETH", "SOL", "USDC", "USDT", "EURC"] }), owed_quantity: num("How much of owed_asset is owed.", { exclusiveMinimum: 0 }), request_id: requestId }, ["name", "kind", "balance"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      return io.mutation("mobile:upsertLiability", {
        ...(text(args, "id", false) ? { id: text(args, "id") } : {}), portfolioId: space.id, name: text(args, "name"),
        kind: oneOf(args, "kind", ["credit_card", "loan", "mortgage", "other"] as const), balance: amount(args, "balance"),
        currency: oneOf(args, "currency", CURRENCIES, false) ?? space.currency,
        ...(args.due_date !== undefined ? { dueDate: date(args, "due_date") } : {}),
        ...(typeof args.owed_asset === "string" ? { owedSymbol: args.owed_asset, owedQuantity: amount(args, "owed_quantity") } : {}), ...write(io, args),
      });
    },
  },
  {
    name: "delete_liability", title: "Delete a debt", write: true,
    description: "Delete one liability.",
    inputSchema: schema({ id: str("Liability id."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("mobile:deleteLiability", { id: text(args, "id"), ...write(io, args) }),
  },
  {
    name: "save_holding", title: "Add or update a holding", write: true,
    description: "Stocks, ETFs, index funds and crypto by symbol. Numa prices them live from the market. cost_basis is the total paid. Send id to update.",
    inputSchema: schema({ id: str("Holding id to update."), space_id: spaceId, symbol: str("Ticker, like AAPL, VWCE or BTC."), name: str("Name, like Apple or Bitcoin."), kind: str("Kind.", { enum: ["stock", "etf", "crypto", "index"] }), quantity: num("How many.", { exclusiveMinimum: 0 }), cost_basis: num("Total paid.", { exclusiveMinimum: 0 }), currency, acquired_at: str("When bought, like 2024-03-01. Default today."), location: where, request_id: requestId }, ["symbol", "name", "kind", "quantity", "cost_basis"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      return io.mutation("mobile:upsertHolding", {
        ...(text(args, "id", false) ? { id: text(args, "id") } : {}), portfolioId: space.id, symbol: text(args, "symbol"), name: text(args, "name"),
        kind: oneOf(args, "kind", ["stock", "etf", "crypto", "index"] as const), quantity: amount(args, "quantity"), costBasis: amount(args, "cost_basis"),
        currency: oneOf(args, "currency", CURRENCIES, false) ?? space.currency, acquiredAt: date(args, "acquired_at", io.now()), ...place(args), ...write(io, args),
      });
    },
  },
  {
    name: "delete_holding", title: "Delete a holding", write: true,
    description: "Delete one holding.",
    inputSchema: schema({ id: str("Holding id."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("mobile:deleteHolding", { id: text(args, "id"), ...write(io, args) }),
  },
  {
    name: "save_goal", title: "Add or update a goal", write: true,
    description: "A target to reach: net worth, monthly income, income in one category, or the value of one asset or holding. Send id to update.",
    inputSchema: schema({
      id: str("Goal id to update."), space_id: spaceId, scope: str("What the goal measures.", { enum: ["net_worth", "monthly_income", "income_category", "asset_value", "holding_value"] }),
      target: num("Target amount.", { exclusiveMinimum: 0 }), currency, label: str("Short name, like Net worth €1M."), deadline: str("By when, like 2027-12-31."),
      category_id: str("For income_category."), asset_id: str("For asset_value."), holding_id: str("For holding_value."), request_id: requestId,
    }, ["scope", "target"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const now = io.now();
      return io.mutation("goals:upsert", {
        ...(text(args, "id", false) ? { id: text(args, "id") } : {}), portfolioId: space.id,
        scope: oneOf(args, "scope", ["net_worth", "monthly_income", "income_category", "asset_value", "holding_value"] as const), target: amount(args, "target"),
        currency: oneOf(args, "currency", CURRENCIES, false) ?? space.currency, startAt: now, createdAt: now,
        ...(args.deadline !== undefined ? { deadline: date(args, "deadline") } : {}),
        ...(text(args, "label", false) ? { label: text(args, "label") } : {}),
        ...(text(args, "category_id", false) ? { categoryId: text(args, "category_id") } : {}),
        ...(text(args, "asset_id", false) ? { assetId: text(args, "asset_id") } : {}),
        ...(text(args, "holding_id", false) ? { holdingId: text(args, "holding_id") } : {}),
        ...write(io, args),
      });
    },
  },
  {
    name: "delete_goal", title: "Delete a goal", write: true,
    description: "Delete one goal.",
    inputSchema: schema({ id: str("Goal id."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("goals:remove", { id: text(args, "id"), ...write(io, args) }),
  },
  {
    name: "set_spending_limit", title: "Set a monthly spending limit", write: true,
    description: "Set or clear the monthly limit of a spending category. Numa alerts the user as spending nears it.",
    inputSchema: schema({ category_id: str("Category id from get_records."), monthly_limit: { type: ["number", "null"], description: "Limit per month, or null to remove it." }, request_id: requestId }, ["category_id", "monthly_limit"]),
    run: (io, args) => io.mutation("categories:update", { id: text(args, "category_id"), patch: { monthlyLimit: args.monthly_limit === null ? null : amount(args, "monthly_limit") }, ...write(io, args) }),
  },
  {
    name: "track_wallet", title: "Track a crypto wallet", write: true,
    description: "Follow a public Bitcoin or EVM address. Numa reads its tokens and Aave lending and borrowing on its own, every 30 minutes. Never send private keys or seed phrases.",
    inputSchema: schema({ space_id: spaceId, address: str("Public address, like bc1q… or 0x…."), address_type: str("bitcoin or evm", { enum: ["bitcoin", "evm"] }), label: str("Name, like Ledger or Main wallet."), counted_in_net_worth: { type: "boolean", description: "Count it in net worth. Default true." }, request_id: requestId }, ["address", "address_type", "label"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      const id = await io.mutation("cryptoWallets:add", {
        portfolioId: space.id, address: text(args, "address"), addressType: oneOf(args, "address_type", ["bitcoin", "evm"] as const), label: text(args, "label"),
        includeInNetWorth: args.counted_in_net_worth !== false, ...write(io, args),
      });
      const walletId = typeof id === "string" ? id : (id as { id?: string }).id;
      const check = walletId ? await io.action("walletSync:refresh", { walletId }).catch(() => null) : null;
      return { id: walletId, first_check: check };
    },
  },
  {
    name: "untrack_wallet", title: "Stop tracking a wallet", write: true,
    description: "Stop following a wallet. The wallet itself is not touched.",
    inputSchema: schema({ id: str("Wallet id."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("cryptoWallets:remove", { id: text(args, "id"), ...write(io, args) }),
  },
  {
    name: "refresh_wallet", title: "Check a wallet now", write: true,
    description: "Read a tracked wallet's balances now instead of waiting for the 30-minute check.",
    inputSchema: schema({ id: str("Wallet id.") }, ["id"]),
    run: (io, args) => io.action("walletSync:refresh", { walletId: text(args, "id") }),
  },
  {
    name: "save_history_point", title: "Save a net worth history point", write: true,
    description: "Add a past or current net worth point to the history chart. net_worth must equal liquid + invested + hard_assets - owed.",
    inputSchema: schema({ space_id: spaceId, date: str("Day, like 2025-06-30."), net_worth: num("Net worth."), liquid: num("Cash and easy-to-sell."), invested: num("Stocks, funds, crypto."), hard_assets: num("Property, vehicles, things."), owed: num("Total debts, positive.", { minimum: 0 }), currency, label: str("Optional note."), request_id: requestId }, ["date", "net_worth", "liquid", "invested", "hard_assets", "owed"]),
    async run(io, args) {
      const space = await resolveSpace(io, args);
      return io.mutation("wealthSnapshots:add", {
        portfolioId: space.id, takenAt: date(args, "date"), netWorth: amount(args, "net_worth"), liquid: amount(args, "liquid"), invested: amount(args, "invested"),
        hardAssets: amount(args, "hard_assets"), liabilities: amount(args, "owed"), currency: oneOf(args, "currency", CURRENCIES, false) ?? space.currency,
        isAuto: false, ...(text(args, "label", false) ? { label: text(args, "label") } : {}), ...write(io, args),
      });
    },
  },
  {
    name: "delete_history_point", title: "Delete a history point", write: true,
    description: "Delete one saved net worth point.",
    inputSchema: schema({ id: str("History point id from get_history."), request_id: requestId }, ["id"]),
    run: (io, args) => io.mutation("wealthSnapshots:remove", { id: text(args, "id"), ...write(io, args) }),
  },
];

export const toolsFor = (access: AgentAccess) => AGENT_TOOLS.filter((t) => access === "full" || !t.write);

/** What a connected agent is told when it first connects. */
export const AGENT_INSTRUCTIONS = [
  "You are connected to the user's Numa Pro account: their net worth, cash, investments, crypto wallets, debts, income, spending, goals and history.",
  "Start with get_overview. Use get_records for ids before changing or deleting something.",
  "Amounts are in major units (12.50 means twelve fifty) in the space currency unless a field ends in _usd.",
  "A missing price or value is unknown, not zero: say so instead of guessing.",
  "Every change you make is saved at once, shown in the app, and listed for the user under Settings, Agents. Before deleting or making large changes, confirm with the user.",
  "Numa never moves money. Wallets are tracked by public address only; never ask for private keys or seed phrases.",
].join(" ");
