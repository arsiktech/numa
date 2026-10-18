import { useAction } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';

import { cloud, type CloudCurrency } from '@/cloud/api';
import { pickAttention, visibleAttention } from '@/domain/attention';
import { usePrefs } from '@/state/prefs';
import { summarizeFlow, type FlowSummary } from '@/domain/flow';
import { summarize, type Summary } from '@/domain/summary';
import type { Attention, Currency } from '@/domain/types';
import { demoAttention, demoDebts, demoHoldings, demoNow, demoOctober, demoPoints } from './demo';
import { useCloudData } from './cloud';
import { denseSeries, type HistoryRange, type PriceSeries, type PricedPiece } from './intraday';
import { itemsFrom } from './items';
import { positionsOf } from './positions';
import { seriesFor, spanMs, todayFromMarkets, type Point, type Range } from './series';

/** Everything Home draws, whichever source it came from. */
export type HomeModel =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'needsSpace'; create: (currency: CloudCurrency) => Promise<void> }
  | {
      status: 'ready';
      source: 'demo' | 'cloud';
      now: number;
      currency: Currency;
      summary: Summary;
      /** False while a record needs an exchange rate we do not have. */
      available: boolean;
      points: Point[];
      hasHistory: boolean;
      live: boolean;
      month: string;
      flow: FlowSummary;
      attention: Attention[];
      empty: boolean;
    };

/** The labelled demo portfolio with a gentle live tick. */
export function useDemoHome(range: Range): HomeModel {
  const { dismissed } = usePrefs();
  const summary = useMemo(() => summarize(demoHoldings, demoDebts, demoNow), []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + (Math.random() - 0.42) * 7000), 1700);
    return () => clearInterval(id);
  }, []);
  const netCents = summary.netCents + Math.round(tick);
  const points = useMemo(() => demoPoints(range, summary.netCents), [range, summary.netCents]);
  return {
    status: 'ready', source: 'demo', now: demoNow.getTime(), currency: 'EUR', summary, available: true,
    points: [...points.slice(0, -1), { t: demoNow.getTime(), cents: netCents }], hasHistory: true, live: true,
    month: 'October', flow: summarizeFlow(demoOctober), attention: pickAttention(visibleAttention(demoAttention, dismissed, demoNow.getTime())), empty: false,
  };
}

/** Price history for the priced positions, per range, refreshed as often as the range needs. */
function usePriceHistory(range: Range, pieces: PricedPiece[]): Record<string, PriceSeries> | null {
  const fetchSeries = useAction(cloud.priceSeries);
  const [store, setStore] = useState<Record<string, Record<string, PriceSeries>>>({});
  const symbols = pieces.map((p) => `${p.kind}:${p.symbol}`).sort().join(',');
  const key = `${range}|${symbols}`;
  useEffect(() => {
    if (range === 'ALL' || !symbols) return;
    let alive = true;
    const load = () => fetchSeries({ range, symbols: symbols.split(',').map((s) => { const [kind, symbol] = s.split(':'); return { kind: kind as 'crypto' | 'stock', symbol }; }) })
      .then((r) => { if (alive) setStore((all) => ({ ...all, [key]: r })); })
      .catch(() => undefined);
    void load();
    // A day line moves every 10 minutes; longer ranges are fetched once per visit.
    const id = range === '1D' ? setInterval(load, 5 * 60_000) : undefined;
    return () => { alive = false; if (id) clearInterval(id); };
  }, [key, range, symbols, fetchSeries]);
  return store[key] ?? null;
}

/** The signed-in person's first portfolio, live from Convex. */
export function useCloudHome(range: Range): HomeModel {
  const cloudData = useCloudData();
  const { dismissed } = usePrefs();
  // Crypto and stocks that move with a market price, merged by symbol across records and wallets.
  const pieces = useMemo<PricedPiece[]>(() => {
    if (cloudData.status !== 'ready') return [];
    const items = itemsFrom(cloudData.snapshot, cloudData.data, cloudData.now, cloudData.fx);
    return (['crypto', 'stocks'] as const).flatMap((g) => positionsOf(items, g)
      .filter((p) => p.valueCents !== null && p.valueCents > 0 && !/^(item|cur|lent):/.test(p.key))
      .map((p) => ({ symbol: p.key, kind: g === 'crypto' ? 'crypto' as const : 'stock' as const, valueCents: p.valueCents! })));
  }, [cloudData]);
  const history = usePriceHistory(range, pieces);
  if (cloudData.status !== 'ready') return cloudData;
  const { data, summary, now } = cloudData;
  const priced = data.holdings.filter((h) => h.valuation.kind === 'synced');
  const marketsToday = priced.length ? priced.reduce((sum, h) => sum + (h.changeTodayCents ?? 0), 0) : null;
  // A year of saved points beats a year drawn from today's holdings; day, week and month always use prices.
  const savedInYear = data.history.filter((p) => p.t >= now - spanMs['1Y']).length;
  const dense = history && range !== 'ALL' && (range !== '1Y' || savedInYear < 2)
    ? denseSeries(range as HistoryRange, now, summary.netCents, pieces, history) : null;
  const today = range === '1D' && !dense ? todayFromMarkets(now, summary.netCents, marketsToday) : null;
  const { points, hasHistory } = dense ? { points: dense, hasHistory: true } : today ?? seriesFor(data.history, now, summary.netCents, range);
  return {
    status: 'ready', source: 'cloud', now, currency: data.currency, summary, available: data.unconverted.length === 0,
    points, hasHistory, live: priced.length > 0,
    month: data.month.month, flow: summarizeFlow(data.month), attention: pickAttention(visibleAttention(data.attention, dismissed, now)), empty: data.empty,
  };
}
