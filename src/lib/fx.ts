import type { CurrencyCode } from "./money";

/** Units of each currency per EUR. Missing entries are unavailable, never 1:1. */
export type FxRates = Record<string, number>;
export const UNKNOWN_FX_RATES: FxRates = Object.freeze({ EUR: 1 });
export const FX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface FxQuote {
  base: "EUR";
  date: string;
  rates: FxRates;
  provider: "frankfurter";
}

export function parseFxQuote(value: unknown, now = Date.now()): FxQuote {
  if (!value || typeof value !== "object") throw new Error("FX rates are unavailable.");
  const data = value as Partial<FxQuote>;
  const date = data.date;
  const quotedAt = typeof date === "string" ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (data.base !== "EUR" || data.provider !== "frankfurter" ||
      !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(quotedAt) ||
      new Date(quotedAt).toISOString().slice(0, 10) !== date || quotedAt > now ||
      !data.rates || typeof data.rates !== "object" || Array.isArray(data.rates)) {
    throw new Error("FX source or quote date is unavailable.");
  }
  const entries = Object.entries(data.rates);
  if (!entries.some(([code]) => code !== "EUR") || entries.some(([code, rate]) =>
    !/^[A-Z]{3}$/.test(code) || !Number.isFinite(rate) || rate <= 0 || (code === "EUR" && rate !== 1))) {
    throw new Error("FX rates are invalid.");
  }
  return { base: "EUR", date, provider: "frankfurter", rates: { ...data.rates, EUR: 1 } };
}

export function fxQuoteIsCurrent(quote: FxQuote, now = Date.now()) {
  const quotedAt = Date.parse(`${quote.date}T00:00:00Z`);
  return quotedAt <= now && now - quotedAt <= FX_MAX_AGE_MS;
}

/** NaN propagates unavailable money through numeric rollups; formatters render
 * it as Unavailable, and writes/charts must reject non-finite totals. */
export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode, rates: FxRates): number {
  if (!Number.isFinite(amount)) return NaN;
  if (from === to || amount === 0) return amount;
  const fromRate = rates[from], toRate = rates[to];
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate! <= 0 || toRate! <= 0) return NaN;
  const converted = (amount / fromRate!) * toRate!;
  return Number.isFinite(converted) ? converted : NaN;
}
