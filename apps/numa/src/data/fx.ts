import type { Currency } from '@/domain/types';

/** US dollars per euro, with the day the rate was published. */
export type FxRate = { usdPerEur: number; asOf: string };

/** Valid ECB observation, at most five UTC calendar days old (inclusive).
 * Publication gaps across weekends/holidays are normal; invalid/future dates are not evidence.
 * This does not change last-known conversion/cache behavior used by existing totals.
 */
export function isFxCurrent(fx: FxRate | null, now: number): boolean {
  if (!fx || !Number.isFinite(fx.usdPerEur) || fx.usdPerEur <= 0 || !Number.isFinite(now) || typeof fx.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fx.asOf) || fx.asOf.startsWith('0000')) return false;
  const day = Date.parse(`${fx.asOf}T00:00:00.000Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== fx.asOf) return false;
  const today = new Date(now);
  if (!Number.isFinite(today.getTime())) return false;
  const age = Math.floor(now / 86_400_000) - Math.floor(day / 86_400_000);
  return age >= 0 && age <= 5;
}

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

/** Longest Home waits for the rate. A hung request must not hold the screen on loading. */
export const FX_TIMEOUT_MS = 5000;

/** Today's rate from Frankfurter, or null when it fails or takes longer than the timeout. */
export async function fetchFxRate(fetcher: typeof fetch = fetch, timeoutMs = FX_TIMEOUT_MS): Promise<FxRate | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetcher('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD', { signal: abort.signal });
    return res.ok ? parseFrankfurter(await res.json()) : null;
  } catch {
    return null; // Offline, blocked or timed out.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publishes a rate as early as it can be trusted, and always publishes at least once.
 * A saved rate that is still current goes out at once, then today's rate replaces it. An older
 * saved rate is only the fallback when today's rate can't be fetched, so it never flashes first.
 */
export async function loadFx(io: { readSaved: () => Promise<string | null>; fetchRate: () => Promise<FxRate | null>; save: (raw: string) => void; now: number }, publish: (fx: FxRate | null) => void): Promise<void> {
  let fresh = false;
  const saved = io.readSaved().then(readSavedFx, () => null);
  const early = saved.then((fx) => { if (fx && !fresh && isFxCurrent(fx, io.now)) publish(fx); });
  const rate = await io.fetchRate();
  if (rate) { fresh = true; publish(rate); io.save(JSON.stringify(rate)); return; }
  await early;
  publish(await saved);
}
