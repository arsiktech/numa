import { addMoney, assertCurrency, assertTimestamp, financeMonth, majorUnits, minorUnits } from "./finance";

export type MobileDashboardCurrency = "USD" | "EUR";

type TxKind = "income" | "expense";
type AssetKind = "cash" | "real_estate" | "vehicle" | "collectible" | "business" | "other";
type QuoteProvider = "coingecko" | "coinbase" | "alpha-vantage" | "stooq" | "finnhub" | "mock";

interface DashboardPortfolio {
  defaultCurrency: MobileDashboardCurrency;
}

interface DashboardTransaction {
  occurredAt: number;
  kind: TxKind;
  amount: number;
  currency: MobileDashboardCurrency;
}

interface DashboardAsset {
  kind: AssetKind;
  balance: number;
  currency: MobileDashboardCurrency;
}

interface DashboardLiability {
  balance: number;
  currency: MobileDashboardCurrency;
}

export interface DashboardHolding {
  symbol: string;
  quantity: number;
  costBasis: number;
  currency: MobileDashboardCurrency;
}

export interface DashboardQuote {
  symbol: string;
  price: number;
  changePercent: number;
  provider: QuoteProvider;
  updatedAt: number;
}

interface DashboardGoal {
  _id?: unknown;
}

export interface DashboardHoldingValuation {
  marketPrice: number;
  marketValue: number;
  marketValueCurrency: MobileDashboardCurrency;
  costBasis: number;
  costBasisCurrency: MobileDashboardCurrency;
  gain: number;
  hasQuote: boolean;
  quoteProvider: QuoteProvider | null;
  quoteUpdatedAt: number | null;
  quoteStale: boolean;
}

export interface MobileDashboardInput {
  portfolio: DashboardPortfolio;
  transactions: DashboardTransaction[];
  assets: DashboardAsset[];
  liabilities: DashboardLiability[];
  holdings: Array<{ holding: DashboardHolding; quote: DashboardQuote | null }>;
  goals: DashboardGoal[];
  nowMs?: number;
  quoteStaleMs?: number;
}

const QUOTE_CURRENCY: MobileDashboardCurrency = "USD";
const DEFAULT_QUOTE_STALE_MS = 36 * 60 * 60 * 1000;

// Convex currently stores only USD/EUR money fields. Rates are units per EUR,
// matching the browser FX helper. Live FX can replace this when it becomes a
// Convex-backed source of truth; until then the response labels the source.
const BACKEND_FX_RATES: Record<MobileDashboardCurrency, number> = {
  EUR: 1,
  USD: 1.08
};

function convertCurrency(
  amount: number,
  from: MobileDashboardCurrency,
  to: MobileDashboardCurrency
) {
  assertCurrency(from);
  assertCurrency(to);
  minorUnits(amount);
  if (from === to) return cents(amount);
  const fromRate = BACKEND_FX_RATES[from];
  const toRate = BACKEND_FX_RATES[to];
  return cents((amount / fromRate) * toRate);
}

function cents(amount: number) {
  return majorUnits(minorUnits(amount));
}

export function valueDashboardHolding(
  holding: DashboardHolding,
  quote: DashboardQuote | null,
  targetCurrency: MobileDashboardCurrency,
  nowMs = Date.now(),
  quoteStaleMs = DEFAULT_QUOTE_STALE_MS
): DashboardHoldingValuation {
  assertCurrency(holding.currency);
  minorUnits(holding.costBasis);
  if (!Number.isFinite(holding.quantity) || holding.quantity < 0 || holding.costBasis < 0) throw new Error("Holding valuation is unavailable");
  if (quote && (!Number.isFinite(quote.price) || quote.price < 0 || !Number.isFinite(quote.updatedAt))) throw new Error("Quote price or date is unavailable");
  const hasQuote = Boolean(quote);
  const rawMarketValue = hasQuote
    ? quote!.price * holding.quantity
    : holding.costBasis;
  const rawMarketValueCurrency = hasQuote ? QUOTE_CURRENCY : holding.currency;
  const quoteUpdatedAt = quote?.updatedAt ?? null;
  const quoteStale =
    hasQuote && quoteUpdatedAt !== null ? quoteUpdatedAt > nowMs || nowMs - quoteUpdatedAt >= quoteStaleMs : false;
  const marketValue = convertCurrency(rawMarketValue, rawMarketValueCurrency, targetCurrency);
  const costBasis = convertCurrency(holding.costBasis, holding.currency, targetCurrency);
  return {
    marketPrice: cents(
      hasQuote
        ? quote!.price
        : holding.quantity > 0
          ? holding.costBasis / holding.quantity
          : 0
    ),
    marketValue: cents(marketValue),
    marketValueCurrency: targetCurrency,
    costBasis: cents(costBasis),
    costBasisCurrency: targetCurrency,
    gain: cents(marketValue - costBasis),
    hasQuote,
    quoteProvider: quote?.provider ?? null,
    quoteUpdatedAt,
    quoteStale
  };
}

export function buildMobileDashboard(input: MobileDashboardInput) {
  const currency = input.portfolio.defaultCurrency;
  const nowMs = input.nowMs ?? Date.now();
  assertCurrency(currency);
  const { start, end, timezone } = financeMonth(nowMs);
  for (const tx of input.transactions) {
    assertTimestamp(tx.occurredAt);
    assertCurrency(tx.currency);
    minorUnits(tx.amount);
    if (tx.amount <= 0 || (tx.kind !== "income" && tx.kind !== "expense")) throw new Error("Invalid legacy income/expense record");
  }
  const monthTransactions = input.transactions.filter(
    (tx) => tx.occurredAt >= start && tx.occurredAt < end && tx.occurredAt <= nowMs
  );
  const income = monthTransactions
    .filter((tx) => tx.kind === "income")
    .reduce((sum, tx) => addMoney(sum, convertCurrency(tx.amount, tx.currency, currency)), 0);
  const expenses = monthTransactions
    .filter((tx) => tx.kind === "expense")
    .reduce((sum, tx) => addMoney(sum, convertCurrency(tx.amount, tx.currency, currency)), 0);
  const liquid = input.assets
    .filter((asset) => asset.kind === "cash")
    .reduce((sum, asset) => addMoney(sum, convertCurrency(asset.balance, asset.currency, currency)), 0);
  const hardAssets = input.assets
    .filter((asset) => asset.kind !== "cash")
    .reduce((sum, asset) => addMoney(sum, convertCurrency(asset.balance, asset.currency, currency)), 0);
  const debt = input.liabilities.reduce(
    (sum, liability) => addMoney(sum, convertCurrency(liability.balance, liability.currency, currency)),
    0
  );
  const holdingValuations = input.holdings.map(({ holding, quote }) =>
    valueDashboardHolding(holding, quote, currency, nowMs, input.quoteStaleMs)
  );
  const invested = holdingValuations.reduce((sum, valuation) => addMoney(sum, valuation.marketValue), 0);
  const marketDriver = holdingValuations.reduce((sum, valuation) => addMoney(sum, valuation.gain), 0);
  const missingQuoteSymbols = input.holdings
    .filter(({ quote }) => !quote || quote.provider === "mock")
    .map(({ holding }) => holding.symbol.toUpperCase());
  const staleQuoteSymbols = input.holdings
    .map(({ holding }, index) =>
      holdingValuations[index]?.quoteStale ? holding.symbol.toUpperCase() : null
    )
    .filter((symbol): symbol is string => Boolean(symbol));
  const cashflowDriver = addMoney(income, -expenses);
  const sharedDriver = 0;
  const monthDelta = addMoney(cashflowDriver, marketDriver, sharedDriver);
  const manualDriver = addMoney(liquid, hardAssets, -debt);
  const netWorth = addMoney(liquid, invested, hardAssets, -debt);

  return {
    currency,
    monthIncome: cents(income),
    monthExpenses: cents(expenses),
    monthCashflow: cents(cashflowDriver),
    monthDelta: cents(monthDelta),
    drivers: {
      cashflow: cents(cashflowDriver),
      market: cents(marketDriver),
      manual: cents(manualDriver),
      shared: sharedDriver
    },
    movementFeed: [
      Math.abs(cashflowDriver) > 0.005
        ? {
            id: "cashflow",
            kind: "cashflow",
            text:
              cashflowDriver >= 0
                ? "Income added more than spending removed this month."
                : "Spending is pulling net worth down this month.",
            amount: cents(cashflowDriver)
          }
        : null,
      Math.abs(marketDriver) > 0.005
        ? {
            id: "market",
            kind: "market",
            text: marketDriver >= 0 ? "Holdings are adding value." : "Holdings are lower than cost basis.",
            amount: cents(marketDriver)
          }
        : null
    ].filter(Boolean),
    liquid: cents(liquid),
    invested: cents(invested),
    hardAssets: cents(hardAssets),
    liabilities: cents(debt),
    netWorth: cents(netWorth),
    transactionCount: input.transactions.length,
    goalCount: input.goals.length,
    dataQuality: {
      generatedAt: nowMs,
      validUntil: nowMs + 5 * 60 * 1000,
      financeContractVersion: 1,
      amountUnit: "major",
      minorUnitScale: 2,
      rounding: "decimal-half-away-from-zero-per-row",
      periodStart: start,
      periodEndExclusive: end,
      recordedThrough: nowMs,
      timezone,
      rollupSource: "legacy-finance-tables",
      ledgerIncluded: false,
      fxEstimated: true,
      fxAsOf: null,
      fxRatesPerEUR: BACKEND_FX_RATES,
      fxRateSource: "backend-fallback",
      quoteCount: holdingValuations.filter((valuation) => valuation.hasQuote).length,
      missingQuoteCount: missingQuoteSymbols.length,
      staleQuoteCount: staleQuoteSymbols.length,
      missingQuoteSymbols,
      staleQuoteSymbols
    }
  };
}
