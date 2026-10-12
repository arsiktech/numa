import { consumeRateLimit } from "./_utils/rate-limit.js";
import {
  fetchCoinGeckoQuotes,
  fetchFinnhubQuotes,
  normalizeSymbols,
  type ServerQuote
} from "../convex/lib/marketQuoteProviders.js";

declare const process: {
  env: Record<string, string | undefined>;
};

interface MarketRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query: {
    symbols?: string | string[];
  };
}

interface MarketResponse {
  setHeader(name: string, value: string): void;
  status(statusCode: number): {
    json(payload: unknown): void;
  };
}

interface MarketQuote {
  symbol: string;
  price: number;
  changePercent: number;
  provider: ServerQuote["provider"];
  updatedAt: string;
}

/**
 * Crypto via CoinGecko's public endpoint; any US-listed stock/ETF via Finnhub
 * when FINNHUB_API_KEY is configured. Symbols nobody can price are omitted, so
 * the client reports them as unavailable rather than valuing them at zero.
 */
export default async function handler(request: MarketRequest, response: MarketResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawSymbols = typeof request.query.symbols === "string" ? request.query.symbols : "";
  const symbols = normalizeSymbols(rawSymbols.split(",")).slice(0, 20);

  if (symbols.length === 0) {
    response.status(400).json({ error: "Provide symbols as a comma-separated query parameter." });
    return;
  }

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/market-quotes",
    limit: 60,
    windowMs: 60_000
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
    return;
  }

  const now = Date.now();
  const fetchImpl = (input: string, init?: { signal?: AbortSignal }) => fetch(input, init);
  const settled = await Promise.allSettled([
    fetchCoinGeckoQuotes(symbols, fetchImpl, now),
    fetchFinnhubQuotes(symbols, process.env.FINNHUB_API_KEY ?? "", fetchImpl, now)
  ]);

  const quotes: Record<string, MarketQuote> = {};
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const quote of result.value) {
      quotes[quote.symbol] = { ...quote, updatedAt: new Date(quote.updatedAt).toISOString() };
    }
  }

  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  response.status(200).json({ quotes });
}
