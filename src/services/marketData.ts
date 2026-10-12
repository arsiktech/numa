import type { MarketQuote, Provider } from "@/lib/types";

export const QUOTE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
export function quoteIsCurrent(quote: MarketQuote | undefined, now = Date.now()): quote is MarketQuote {
  return !!quote && quote.provider !== "mock" && Number.isFinite(quote.price) && quote.price >= 0 &&
    Number.isFinite(quote.updatedAt) && quote.updatedAt <= now && now - quote.updatedAt <= QUOTE_MAX_AGE_MS;
}

export async function fetchMarketQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const unique = Array.from(new Set(symbols.map(s => s.toUpperCase().trim()).filter(Boolean)));
  if (!unique.length) return [];
  const quotes: MarketQuote[] = [];
  // The API accepts at most 20 symbols. Do not silently drop later positions.
  for (let start = 0; start < unique.length; start += 20) {
    const batch = unique.slice(start, start + 20);
    const params = new URLSearchParams({ symbols: batch.join(",") });
    const response = await fetch(`/api/market-quotes?${params}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Market refresh failed (${response.status}).`);
    const data = await response.json();
    if (!data?.quotes || typeof data.quotes !== "object" || Array.isArray(data.quotes)) {
      throw new Error("Market response is unavailable.");
    }
    for (const item of Object.values(data.quotes)) {
      const raw = item as Record<string, unknown>;
      if (!raw || typeof raw !== "object" || typeof raw.symbol !== "string" || !batch.includes(raw.symbol)) continue;
      if (!["coingecko", "stooq", "alpha-vantage", "finnhub"].includes(String(raw.provider))) continue;
      const quote: MarketQuote = {
        symbol: raw.symbol, price: typeof raw.price === "number" ? raw.price : NaN,
        changePercent: typeof raw.changePercent === "number" ? raw.changePercent : NaN,
        provider: raw.provider as Provider,
        updatedAt: typeof raw.updatedAt === "string" ? Date.parse(raw.updatedAt) : NaN
      };
      if (quoteIsCurrent(quote) && Number.isFinite(quote.changePercent)) quotes.push(quote);
    }
  }
  return quotes;
}
