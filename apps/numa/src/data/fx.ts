import type { Currency } from '@/domain/types';

/** US dollars per euro, with the day the rate was published. */
export type FxRate = { usdPerEur: number; asOf: string };

/** Converts integer cents between EUR and USD. Returns null when a rate is needed and there is none. */
export function convertCents(cents: number, from: Currency, to: Currency, fx: FxRate | null): number | null {
  if (from === to) return cents;
  if (!fx || !(fx.usdPerEur > 0)) return null;
  return Math.round(from === 'EUR' ? cents * fx.usdPerEur : cents / fx.usdPerEur);
}

/** Parses the ECB reference rate from the Frankfurter API (no key, no account data sent). */
export function parseFrankfurter(json: unknown): FxRate | null {
  const body = json as { rates?: { USD?: unknown }; date?: unknown } | null;
  const usd = body?.rates?.USD;
  const date = body?.date;
  if (typeof usd !== 'number' || !(usd > 0) || typeof date !== 'string') return null;
  return { usdPerEur: usd, asOf: date };
}

/** A rate this device saved earlier, or null when there is none or it is corrupt. */
export function readSavedFx(raw: string | null): FxRate | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<FxRate> | null;
    return v && typeof v.usdPerEur === 'number' && v.usdPerEur > 0 && typeof v.asOf === 'string' ? { usdPerEur: v.usdPerEur, asOf: v.asOf } : null;
  } catch {
    return null;
  }
}
