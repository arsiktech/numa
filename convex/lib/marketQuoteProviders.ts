/**
 * Server-side market quote providers shared by the Vercel `/api/market-quotes`
 * route (web) and the Convex quote refresh cron (iOS reads `marketQuotes`).
 *
 * Only ticker symbols ever leave Numa Pro. Every quote is USD-denominated
 * (see QUOTE_CURRENCY in src/lib/analytics.ts); a provider that cannot answer
 * returns nothing, so the holding stays visibly unpriced instead of zero.
 */

export type ServerQuoteProvider = "coingecko" | "finnhub";

export interface ServerQuote {
  symbol: string;
  price: number;
  changePercent: number;
  provider: ServerQuoteProvider;
  /** Epoch milliseconds of the provider's own quote time. */
  updatedAt: number;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** AbortSignal.timeout is missing from some runtimes; then the request is simply unbounded. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana"
};

/** US-listed tickers: letters/digits with an optional class suffix (BRK.B, BF-B). */
const US_TICKER = /^[A-Z][A-Z0-9]{0,5}([.-][A-Z]{1,2})?$/;

export function isCryptoSymbol(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(COINGECKO_IDS, symbol);
}

export function isUsEquitySymbol(symbol: string): boolean {
  return !isCryptoSymbol(symbol) && US_TICKER.test(symbol);
}

export function normalizeSymbols(symbols: Iterable<string>): string[] {
  return [...new Set([...symbols].map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

export async function fetchCoinGeckoQuotes(
  symbols: string[],
  fetchImpl: FetchLike,
  nowMs: number
): Promise<ServerQuote[]> {
  const wanted = symbols.filter(isCryptoSymbol);
  if (wanted.length === 0) return [];
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", wanted.map((symbol) => COINGECKO_IDS[symbol]).join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_last_updated_at", "true");
  const result = await fetchImpl(url.toString(), { signal: timeoutSignal(6_000) });
  if (!result.ok) return [];
  const data = (await result.json()) as Record<
    string,
    { usd?: unknown; usd_24h_change?: unknown; last_updated_at?: unknown } | undefined
  >;
  const quotes: ServerQuote[] = [];
  for (const symbol of wanted) {
    const row = data?.[COINGECKO_IDS[symbol]];
    const price = Number(row?.usd);
    if (!row || !Number.isFinite(price) || price <= 0) continue;
    const change = Number(row.usd_24h_change);
    const updatedSeconds = Number(row.last_updated_at);
    const updatedAt = Number.isFinite(updatedSeconds) && updatedSeconds > 0
      ? Math.min(updatedSeconds * 1000, nowMs)
      : nowMs;
    quotes.push({
      symbol,
      price,
      changePercent: Number.isFinite(change) ? change : 0,
      provider: "coingecko",
      updatedAt
    });
  }
  return quotes;
}

/**
 * Markets close on weekends and holidays, so Friday's close is still the
 * current price on Monday morning. Every client treats quotes older than 36h
 * as stale; a just-confirmed closing price within this window is stamped with
 * the confirmation time so weekends do not blank net worth. An older trade
 * (halted or delisted ticker) keeps its real time and is shown as stale.
 */
export const MARKET_CLOSURE_GRACE_MS = 4 * 24 * 60 * 60 * 1000;

export function confirmedQuoteTime(tradedAt: number, nowMs: number): number {
  return nowMs - tradedAt <= MARKET_CLOSURE_GRACE_MS ? nowMs : tradedAt;
}

/**
 * Finnhub `/quote` (free plan: US exchanges, 60 calls/minute). `t` is the
 * last trade time in seconds; `c` of 0 with `t` of 0 means "unknown symbol".
 */
export async function fetchFinnhubQuote(
  symbol: string,
  apiKey: string,
  fetchImpl: FetchLike,
  nowMs: number
): Promise<ServerQuote | null> {
  if (!apiKey || !isUsEquitySymbol(symbol)) return null;
  const url = new URL("https://finnhub.io/api/v1/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", apiKey);
  const result = await fetchImpl(url.toString(), { signal: timeoutSignal(5_000) });
  if (!result.ok) return null;
  const data = (await result.json()) as { c?: unknown; dp?: unknown; t?: unknown } | null;
  const price = Number(data?.c);
  const tradedAtSeconds = Number(data?.t);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(tradedAtSeconds) || tradedAtSeconds <= 0) {
    return null;
  }
  const change = Number(data?.dp);
  const tradedAt = Math.min(tradedAtSeconds * 1000, nowMs);
  return {
    symbol,
    price,
    changePercent: Number.isFinite(change) ? change : 0,
    provider: "finnhub",
    updatedAt: confirmedQuoteTime(tradedAt, nowMs)
  };
}

/** Sequential on purpose: stays well inside Finnhub's free per-minute limit. */
export async function fetchFinnhubQuotes(
  symbols: string[],
  apiKey: string,
  fetchImpl: FetchLike,
  nowMs: number
): Promise<ServerQuote[]> {
  if (!apiKey) return [];
  const quotes: ServerQuote[] = [];
  for (const symbol of symbols.filter(isUsEquitySymbol)) {
    try {
      const quote = await fetchFinnhubQuote(symbol, apiKey, fetchImpl, nowMs);
      if (quote) quotes.push(quote);
    } catch {
      // One failed ticker must not hide the others.
    }
  }
  return quotes;
}
