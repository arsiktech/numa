import { useEffect, useState } from "react";
import { UNKNOWN_FX_RATES, fxQuoteIsCurrent, parseFxQuote, type FxQuote, type FxRates } from "@/lib/fx";

const CACHE_KEY = "numa:fx:rates:v2";
const REFRESH_MS = 24 * 60 * 60 * 1000;
interface CachedRates extends FxQuote { fetchedAt: number }
let pendingRequest: Promise<CachedRates> | null = null;

export async function fetchEcbRates(): Promise<FxQuote> {
  const response = await fetch("/api/fx-rates", {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`FX refresh failed (${response.status}).`);
  return parseFxQuote(await response.json());
}

function readCache(): CachedRates | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
    if (!Number.isFinite(value?.fetchedAt) || value.fetchedAt > Date.now()) return null;
    return { ...parseFxQuote(value), fetchedAt: value.fetchedAt };
  } catch { return null; }
}

function requestRates() {
  // Each effect subscribes independently, including StrictMode replacements.
  // Cleanup cannot strand another subscriber's loading state.
  if (!pendingRequest) pendingRequest = fetchEcbRates().then(quote => {
    const cached = { ...quote, fetchedAt: Date.now() };
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached)); } catch { /* cache is optional */ }
    return cached;
  }).finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export interface UseFxRatesResult {
  rates: FxRates;
  asOf: string;
  source: "frankfurter" | null;
  status: "current" | "stale" | "unavailable";
  loading: boolean;
}

export function useFxRates(): UseFxRatesResult {
  const [quote, setQuote] = useState(readCache);
  const [loading, setLoading] = useState(!quote);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function refresh(force = false) {
      const currentTime = Date.now();
      setNow(currentTime);
      const cached = readCache();
      if (!force && cached && currentTime - cached.fetchedAt < REFRESH_MS && fxQuoteIsCurrent(cached, currentTime)) {
        setQuote(cached); setLoading(false); return;
      }
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const result = await requestRates();
        if (!cancelled) { setQuote(result); setRefreshFailed(false); setNow(Date.now()); }
      } catch {
        if (!cancelled) setRefreshFailed(true);
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }
    void refresh();
    const onOnline = () => { void refresh(true); };
    const onFocus = () => { void refresh(); };
    const timer = window.setInterval(onFocus, 60_000);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const current = quote && !refreshFailed && now - quote.fetchedAt < REFRESH_MS && fxQuoteIsCurrent(quote, now);
  return {
    rates: current ? quote.rates : UNKNOWN_FX_RATES,
    asOf: quote?.date ?? "", source: quote?.provider ?? null,
    status: current ? "current" : quote ? "stale" : "unavailable", loading
  };
}
