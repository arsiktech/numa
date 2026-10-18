/**
 * Price history for the chart, on a fixed grid per range: every 10 minutes for a day, every hour
 * for a week, every 4 hours for a month, every day for a year. Crypto comes from Coinbase Exchange
 * candles and stocks from Yahoo Finance charts, both free and keyless. A symbol neither knows is
 * left out, and the chart keeps it at today's value instead of guessing.
 */

export type ChartRange = "1D" | "1W" | "1M" | "1Y";
export type Get = (url: string) => Promise<unknown>;
export type Series = { t: number[]; p: number[] };

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const GRID: Record<ChartRange, { step: number; span: number; ttl: number }> = {
  "1D": { step: 10 * MIN, span: DAY, ttl: 5 * MIN },
  "1W": { step: HOUR, span: 7 * DAY, ttl: 30 * MIN },
  "1M": { step: 4 * HOUR, span: 30 * DAY, ttl: 2 * HOUR },
  "1Y": { step: DAY, span: 365 * DAY, ttl: 12 * HOUR },
};

/** Stablecoins hold their value; the chart keeps them flat without asking anyone. */
export const STABLE = new Set(["USDC", "USDT", "DAI", "USDG", "USDS", "PYUSD", "FDUSD", "USDE", "TUSD", "GHO", "EURC"]);
/** Wrapped coins move with the coin they wrap. */
const ALIAS: Record<string, string> = { WETH: "ETH", WBTC: "BTC", CBBTC: "BTC", TBTC: "BTC", MATIC: "POL", WPOL: "POL" };

/** Grid times from the start of the range to now, oldest first. */
export function gridFor(range: ChartRange, now: number): number[] {
  const { step, span } = GRID[range];
  const end = Math.floor(now / step) * step;
  const out: number[] = [];
  for (let t = end - span; t <= end; t += step) out.push(t);
  return out;
}

/** Each grid time takes the last known price at or before it; before the first, the first. */
export function resample(times: number[], prices: number[], grid: number[]): number[] | null {
  const pairs = times.map((t, i) => [t, prices[i]] as const).filter(([, p]) => Number.isFinite(p) && p > 0).sort((a, b) => a[0] - b[0]);
  if (!pairs.length) return null;
  const out: number[] = [];
  let j = 0;
  for (const g of grid) {
    while (j + 1 < pairs.length && pairs[j + 1][0] <= g) j++;
    out.push(pairs[j][1]);
  }
  return out;
}

/** Coinbase candles: [start, low, high, open, close, volume]; a candle's close is its price at its end. */
async function coinbase(symbol: string, range: ChartRange, now: number, get: Get): Promise<Series | null> {
  const product = `${ALIAS[symbol] ?? symbol}-USD`;
  const granularity = range === "1D" ? 300 : range === "1Y" ? 86400 : 3600;
  const span = GRID[range].span;
  // At most 300 candles per request, so a month of hours or a year of days takes a few.
  const windows = Math.ceil(span / (granularity * 1000 * 290));
  const times: number[] = [], prices: number[] = [];
  for (let w = 0; w < windows; w++) {
    const end = now - (w * span) / windows, start = now - ((w + 1) * span) / windows - granularity * 1000;
    const url = `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
    const rows = await get(url);
    if (!Array.isArray(rows)) return null;
    for (const r of rows) if (Array.isArray(r) && r.length >= 5) { times.push(r[0] * 1000 + granularity * 1000); prices.push(Number(r[4])); }
  }
  const grid = gridFor(range, now);
  const p = resample(times, prices, grid);
  return p ? { t: grid, p } : null;
}

const YAHOO: Record<ChartRange, string> = { "1D": "range=1d&interval=5m", "1W": "range=5d&interval=60m", "1M": "range=1mo&interval=60m", "1Y": "range=1y&interval=1d" };

/** Yahoo Finance chart: closes per timestamp; before the first trade of the range, the previous close. */
async function yahoo(symbol: string, range: ChartRange, now: number, get: Get): Promise<Series | null> {
  const body = (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${YAHOO[range]}`)) as {
    chart?: { result?: Array<{ meta?: { chartPreviousClose?: number; currency?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
  };
  const r = body?.chart?.result?.[0];
  if (!r?.timestamp || !r.indicators?.quote?.[0]?.close) return null;
  // Prices in another currency would be read as dollars; leave those out rather than mislabel them.
  if (r.meta?.currency && r.meta.currency !== "USD") return null;
  const times = r.timestamp.map((s) => s * 1000);
  const prices = r.indicators.quote[0].close.map((c) => (c === null ? NaN : c));
  const prev = r.meta?.chartPreviousClose;
  if (prev && prev > 0 && times.length) { times.unshift(times[0] - 1); prices.unshift(prev); }
  const grid = gridFor(range, now);
  const p = resample(times, prices, grid);
  return p ? { t: grid, p } : null;
}

export async function fetchSeries(symbol: string, kind: "crypto" | "stock", range: ChartRange, now: number, get: Get): Promise<Series | null> {
  const s = symbol.toUpperCase();
  if (!/^[A-Z0-9.\-]{1,15}$/.test(s) || STABLE.has(s)) return null;
  try {
    return kind === "crypto" ? await coinbase(s, range, now, get) : await yahoo(s, range, now, get);
  } catch {
    return null;
  }
}
