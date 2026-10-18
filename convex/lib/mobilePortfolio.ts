import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMember, type AnyCtx } from "./access";
import { minorUnits } from "./finance";
import { buildMobileDashboard, valueDashboardHolding } from "./mobileDashboard";
import { spaceKind, spaceSummary } from "../spaces";
import { computeRecurringRevenue } from "./recurringRevenue";

export function mobileProfile(
  userId: Id<"users">,
  user: Doc<"users"> | null,
  profile: Doc<"profiles">
) {
  return {
    id: profile._id,
    userId,
    email: (user as { email?: string } | null)?.email ?? null,
    displayName: profile.displayName,
    defaultCurrency: profile.defaultCurrency,
    theme: profile.theme,
    locale: profile.locale ?? "en",
    appMode: profile.appMode ?? "advanced",
    themeKey: profile.themeKey ?? "citrus",
    primaryJob: profile.primaryJob ?? null,
    starterTemplate: profile.starterTemplate ?? null,
    deletionScheduledAt: profile.deletionScheduledAt ?? null,
    deletionStartedAt: profile.deletionStartedAt ?? null,
    createdAt: profile.createdAt
  };
}

export function mobilePortfolio(portfolio: Doc<"portfolios">, membership: Doc<"memberships">) {
  return spaceSummary(portfolio, membership);
}

export function mobileCategory(category: Doc<"categories">, budgetCurrency: "USD" | "EUR") {
  return {
    id: category._id,
    portfolioId: category.portfolioId,
    name: category.name,
    kind: category.kind,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
    emoji: category.emoji ?? null,
    monthlyLimit: category.monthlyLimit ?? null,
    budgetCurrency: category.monthlyLimitCurrency ?? budgetCurrency
  };
}

export function mobileTransaction(tx: Doc<"transactions">) {
  return {
    id: tx._id,
    portfolioId: tx.portfolioId,
    occurredAt: tx.occurredAt,
    description: tx.description,
    categoryId: tx.categoryId ?? null,
    accountId: tx.accountId ?? null,
    kind: tx.kind,
    classification: tx.kind === "income" ? "earned_income" : "expense",
    amountMinor: minorUnits(tx.amount),
    amount: tx.amount,
    currency: tx.currency,
    createdByUserId: tx.createdByUserId,
    notes: tx.notes ?? null,
    location: tx.location ?? null
  };
}

export function mobileAsset(asset: Doc<"assets">) {
  return {
    id: asset._id,
    portfolioId: asset.portfolioId,
    name: asset.name,
    kind: asset.kind,
    balance: asset.balance,
    currency: asset.currency,
    notes: asset.notes ?? null,
    location: asset.location ?? null,
    updatedAt: asset.updatedAt
  };
}

export function mobileLiability(liability: Doc<"liabilities">) {
  return {
    id: liability._id,
    portfolioId: liability.portfolioId,
    name: liability.name,
    kind: liability.kind,
    balance: liability.balance,
    currency: liability.currency,
    interestRate: liability.interestRate ?? null,
    dueDate: liability.dueDate ?? null,
    notes: liability.notes ?? null,
    updatedAt: liability.updatedAt
  };
}

export function mobileHolding(holding: Doc<"holdings">, quote: Doc<"marketQuotes"> | null) {
  const valuation = valueDashboardHolding(holding, quote, holding.currency);
  return {
    id: holding._id,
    portfolioId: holding.portfolioId,
    symbol: holding.symbol,
    name: holding.name,
    kind: holding.kind,
    quantity: holding.quantity,
    costBasis: holding.costBasis,
    currency: holding.currency,
    acquiredAt: holding.acquiredAt,
    location: holding.location ?? null,
    marketPrice: valuation.marketPrice,
    marketValue: valuation.marketValue,
    marketValueCurrency: valuation.marketValueCurrency,
    costBasisValue: valuation.costBasis,
    unrealizedGain: valuation.gain,
    changePercent: quote?.changePercent ?? 0,
    quoteProvider: quote?.provider ?? null,
    quoteUpdatedAt: quote?.updatedAt ?? null,
    quoteStale: valuation.quoteStale
  };
}

export function mobileGoal(goal: Doc<"goals">) {
  return {
    id: goal._id,
    portfolioId: goal.portfolioId,
    scope: goal.scope,
    target: goal.target,
    currency: goal.currency,
    startAt: goal.startAt,
    deadline: goal.deadline ?? null,
    label: goal.label ?? null,
    categoryId: goal.categoryId ?? null,
    assetId: goal.assetId ?? null,
    holdingId: goal.holdingId ?? null,
    createdAt: goal.createdAt
  };
}

export function mobileRecurring(row: Doc<"recurring">) {
  return {
    id: row._id,
    portfolioId: row.portfolioId,
    description: row.description,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    categoryId: row.categoryId ?? null,
    accountId: row.accountId ?? null,
    cadence: row.cadence,
    startAt: row.startAt,
    nextRunAt: row.nextRunAt,
    endAt: row.endAt ?? null,
    notes: row.notes ?? null,
    active: row.active,
    revenueType: row.revenueType ?? null,
    incomeSource: row.incomeSource ?? null,
    createdAt: row.createdAt
  };
}

/** Business spaces only: a personal space must not show a misleading zero ARR. */
export function mobileRecurringRevenue(portfolio: Doc<"portfolios">, recurring: Doc<"recurring">[], now = Date.now()) {
  if (spaceKind(portfolio) !== "business") return null;
  return computeRecurringRevenue(
    recurring.map(row => ({ ...row, id: row._id })),
    { currency: portfolio.defaultCurrency, now }
  );
}

export function mobileWealthSnapshot(row: Doc<"wealthSnapshots">) {
  return {
    id: row._id,
    portfolioId: row.portfolioId,
    takenAt: row.takenAt,
    netWorth: row.netWorth,
    liquid: row.liquid,
    invested: row.invested,
    hardAssets: row.hardAssets,
    liabilities: row.liabilities,
    currency: row.currency,
    label: row.label ?? null,
    isAuto: row.isAuto,
    lines: row.lines ?? null
  };
}

export async function userPortfolios(ctx: AnyCtx, userId: Id<"users">) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const portfolios = await Promise.all(memberships.map((m) => ctx.db.get(m.portfolioId)));
  return memberships
    .map((membership, index) => {
      const portfolio = portfolios[index];
      return portfolio ? { portfolio, membership } : null;
    })
    .filter((entry): entry is { portfolio: Doc<"portfolios">; membership: Doc<"memberships"> } =>
      Boolean(entry)
    )
    .sort((a, b) => a.portfolio.createdAt - b.portfolio.createdAt);
}

export async function buildPortfolioSnapshot(ctx: AnyCtx, portfolioId: Id<"portfolios">) {
  const { membership } = await requireMember(ctx, portfolioId);
  const portfolio = await ctx.db.get(portfolioId);
  if (!portfolio) throw new ConvexError({ code: "NOT_FOUND", message: "Portfolio not found" });
  const [
    categories,
    transactions,
    transfers,
    assets,
    liabilities,
    holdings,
    goals,
    recurring,
    snapshots
  ] = await Promise.all([
    ctx.db.query("categories").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("transactions").withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("cashTransfers").withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("assets").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("liabilities").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("holdings").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("goals").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("recurring").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect(),
    ctx.db.query("wealthSnapshots").withIndex("by_portfolio_time", (q) => q.eq("portfolioId", portfolioId)).collect()
  ]);
  const quoteSymbols = [...new Set(holdings.map((holding) => holding.symbol.toUpperCase()))];
  const quoteEntries = await Promise.all(
    quoteSymbols.map(async (symbol): Promise<[string, Doc<"marketQuotes"> | null]> => [
      symbol,
      await ctx.db
        .query("marketQuotes")
        .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
        .unique()
    ])
  );
  const quotesBySymbol = new Map(quoteEntries);
  const holdingsWithQuotes = holdings.map((holding) => ({
    holding,
    quote: quotesBySymbol.get(holding.symbol.toUpperCase()) ?? null
  }));
  const mobileHoldings = holdingsWithQuotes.map(({ holding, quote }) => mobileHolding(holding, quote));
  return {
    portfolio: mobilePortfolio(portfolio, membership),
    dashboard: buildMobileDashboard({
      portfolio,
      transactions,
      assets,
      liabilities,
      holdings: holdingsWithQuotes,
      goals
    }),
    categories: categories.sort((a, b) => a.sortOrder - b.sortOrder).map(category => mobileCategory(category, portfolio.defaultCurrency)),
    transactions: transactions.sort((a, b) => b.occurredAt - a.occurredAt).map(mobileTransaction),
    transfers: transfers.filter(transfer => transfer.deletedAt === undefined)
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .map(transfer => ({
        id: transfer._id, portfolioId: transfer.portfolioId,
        fromAccountId: transfer.fromAccountId, toAccountId: transfer.toAccountId,
        amount: transfer.amount, amountMinor: minorUnits(transfer.amount), currency: transfer.currency,
        occurredAt: transfer.occurredAt, description: transfer.description, notes: transfer.notes ?? null,
        sourceEventId: transfer.sourceEventId, createdByUserId: transfer.createdByUserId,
        createdAt: transfer.createdAt, updatedAt: transfer.updatedAt
      })),
    assets: assets.map(mobileAsset),
    liabilities: liabilities.map(mobileLiability),
    holdings: mobileHoldings,
    goals: goals.map(mobileGoal),
    recurring: recurring.sort((a, b) => a.nextRunAt - b.nextRunAt).map(mobileRecurring),
    revenue: mobileRecurringRevenue(portfolio, recurring),
    wealthSnapshots: snapshots.sort((a, b) => a.takenAt - b.takenAt).map(mobileWealthSnapshot)
  };
}

