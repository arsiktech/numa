import { useEffect, useState } from "react";
import { useNuma } from "@/services/store";
import { fetchMarketQuotes, quoteIsCurrent } from "@/services/marketData";

export function useMarketSync() {
  const { state, dispatch } = useNuma();
  const symbols = [...new Set(state.holdings.map(h => h.symbol.toUpperCase()).filter(Boolean))].sort().join(",");
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const requested = symbols ? symbols.split(",") : [];
    setFailedSymbols([]);
    async function refresh() {
      if (!requested.length || inFlight) return;
      inFlight = true;
      try {
        const quotes = await fetchMarketQuotes(requested);
        if (cancelled) return;
        if (quotes.length) dispatch({ type: "patchMarketQuotes", quotes });
        setFailedSymbols(requested.filter(symbol => !quotes.some(quote => quote.symbol === symbol)));
      } catch {
        if (!cancelled) setFailedSymbols(requested);
      } finally {
        inFlight = false;
        if (!cancelled) setNow(Date.now());
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 90_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [symbols, dispatch]);
  const unavailable = symbols.split(",").filter(Boolean).filter(symbol => !quoteIsCurrent(state.marketQuotes[symbol], now));
  const retainedDates = failedSymbols.map(symbol => state.marketQuotes[symbol]?.updatedAt).filter(Number.isFinite);
  return {
    failedSymbols, unavailable,
    oldestRetainedAt: retainedDates.length ? Math.min(...retainedDates) : null
  };
}
