import { useAction, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';

import { cloud, type CloudCurrency } from '@/cloud/api';
import { liquidSummary, useInvested, type Invested } from '@/loans/useInvested';
import { useLoans } from '@/loans/useLoans';
import { pickAttention, visibleAttention } from '@/domain/attention';
import { usePrefs } from '@/state/prefs';
import { summarizeFlow, type FlowSummary } from '@/domain/flow';
import { summarize, type Summary } from '@/domain/summary';
import type { Attention, Currency } from '@/domain/types';
import { demoAttention, demoDebts, demoHoldings, demoNow, demoOctober, demoPoints } from './demo';
import { useCloudData } from './cloud';
import type { FxRate } from './fx';
import { pledgedBacked } from './loans';
import { denseSeries, type HistoryRange, type PriceSeries, type PricedPiece, pricedPiecesOf } from './intraday';
import type { MovementBasis } from './homeMovers';
import { itemsFrom, type Item } from './items';
import { seriesFor, spanMs, todayFromMarkets, type Point, type Range } from './series';
import { demoItems } from './useItems';

/** Everything Home draws, whichever source it came from. */
export type HomeModel =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'needsSpace'; create: (currency: CloudCurrency) => Promise<void> }
  | {
      status: 'ready';
      source: 'demo' | 'cloud';
      /** In-memory scope only; never placed in a navigation URL. */
      scope: string;
      now: number;
      currency: Currency;
      /** Observation retained for movement evidence; existing totals may use last-known FX. */
      fx: FxRate | null;
      summary: Summary;
      /** How much of what is owed is backed by collateral; null while loans are still loading, and in no space without any. */
      pledged: { cents: number; partial: boolean } | null;
      /** Owed money that went into things that can't be sold within a week; null while loans load, and in the demo. */
      invested: Invested | null;
      /** False while a record needs an exchange rate we do not have. */
      available: boolean;
      points: Point[];
      hasHistory: boolean;
      live: boolean;
      month: string;
      flow: FlowSummary;
      attention: Attention[];
      empty: boolean;
      items: Item[];
      movementBasis: MovementBasis;
    };

/** The labelled demo portfolio with a gentle live tick. */
export function useDemoHome(range: Range): HomeModel {
  const { dismissed } = usePrefs();
  const summary = useMemo(() => summarize(demoHoldings, demoDebts, demoNow), []);
  const items = useMemo(() => demoItems(), []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + (Math.random() - 0.42) * 7000), 1700);
    return () => clearInterval(id);
  }, []);
  const netCents = summary.netCents + Math.round(tick);
  // The demo's pledged coins back its USDC loan; the debt is covered up to their value.
  const pledgedCents = demoHoldings.filter((x) => x.liquidity.kind === 'pledged').reduce((t, x) => t + (x.valuation.kind === 'missing' ? (x.valuation.lastKnownCents ?? 0) : x.valuation.valueCents), 0);
  const points = useMemo(() => demoPoints(range, summary.netCents), [range, summary.netCents]);
  return {
    status: 'ready', source: 'demo', scope: 'demo', now: demoNow.getTime(), currency: 'EUR', fx: null, summary, pledged: { cents: Math.min(summary.oweCents, pledgedCents), partial: false }, invested: null, available: true, items, movementBasis: { kind: 'demo' },
    points: [...points.slice(0, -1), { t: demoNow.getTime(), cents: netCents }], hasHistory: true, live: true,
    month: 'October', flow: summarizeFlow(demoOctober), attention: pickAttention(visibleAttention(demoAttention, dismissed, demoNow.getTime())), empty: false,
  };
}

/** Price history for the priced positions, per range, refreshed as often as the range needs. */
function usePriceHistory(range: Range, pieces: PricedPiece[]): Record<string, PriceSeries> | null {
  const fetchSeries = useAction(cloud.priceSeries);
  const symbols = pieces.map((p) => ({ kind: p.kind, symbol: p.symbol }));
  const cached = useQuery(cloud.priceSeriesRead, range === 'ALL' || symbols.length === 0 ? 'skip' : { range, symbols });
  const key = `${range}|${symbols.map((s) => `${s.kind}:${s.symbol}`).sort().join(',')}`;
  const [filled, setFilled] = useState<Record<string, PriceSeries>>({});
  useEffect(() => {
    if (range === 'ALL' || cached === undefined) return;
    const wanted = key.slice(range.length + 1).split(',').filter(Boolean).map((item) => {
      const [kind, symbol] = item.split(':');
      return { kind: kind as 'crypto' | 'stock', symbol };
    });
    const missing = wanted.filter((s) => s.symbol && !cached[s.symbol.toUpperCase()] && !filled[s.symbol.toUpperCase()]);
    if (!missing.length) return;
    let alive = true;
    void fetchSeries({ range, symbols: missing }).then((rows) => { if (alive) setFilled((all) => ({ ...all, ...rows })); }).catch(() => undefined);
    return () => { alive = false; };
  }, [cached, fetchSeries, filled, key, range]);
  if (range === 'ALL' || symbols.length === 0) return null;
  return { ...(cached ?? {}), ...filled };
}

/** The signed-in person's first portfolio, live from Convex. */
export function useCloudHome(range: Range): HomeModel {
  const cloudData = useCloudData();
  const loans = useLoans();
  const invested = useInvested();
  const { dismissed } = usePrefs();
  const items = useMemo(() => cloudData.status === 'ready' ? itemsFrom(cloudData.snapshot, cloudData.data, cloudData.now, cloudData.fx) : [], [cloudData]);
  // Crypto and stocks that move with a market price, merged by symbol across records and wallets.
  const pieces = useMemo<PricedPiece[]>(() => {
    if (cloudData.status !== 'ready') return [];
    return pricedPiecesOf(items);
  }, [cloudData, items]);
  const history = usePriceHistory(range, pieces);
  if (cloudData.status !== 'ready') return cloudData;
  const { data, now } = cloudData;
  // Money borrowed into a company or property is still owed, but is not taken from Liquid after debts.
  const summary = liquidSummary(cloudData.summary, invested);
  const priced = data.holdings.filter((h) => h.valuation.kind === 'synced');
  const marketsToday = priced.length ? priced.reduce((sum, h) => sum + (h.changeTodayCents ?? 0), 0) : null;
  // A year of saved points beats a year drawn from today's holdings; day, week and month always use prices.
  const savedInYear = data.history.filter((p) => p.t >= now - spanMs['1Y']).length;
  const dense = history && range !== 'ALL' && (range !== '1Y' || savedInYear < 2)
    ? denseSeries(range as HistoryRange, now, summary.netCents, pieces, history) : null;
  const today = range === '1D' && !dense ? todayFromMarkets(now, summary.netCents, marketsToday) : null;
  const { points, hasHistory } = dense ? { points: dense, hasHistory: true } : today ?? seriesFor(data.history, now, summary.netCents, range);
  return {
    status: 'ready', source: 'cloud', scope: `${cloudData.boot.profile.userId}:${cloudData.portfolioId}`, now, currency: data.currency, fx: cloudData.fx, summary,
    pledged: loans.status === 'ready' ? pledgedBacked(loans.loans) : null, invested,
    available: data.unconverted.length === 0 && [summary.netCents, summary.ownCents, summary.oweCents, summary.liquidCents, summary.liquidAfterDebtsCents, summary.cashCents, ...points.map((p) => p.cents)].every(Number.isSafeInteger),
    items, movementBasis: dense && history && range !== 'ALL' ? { kind: 'history', range, pieces, history } : { kind: today ? 'quotes' : 'saved' },
    points, hasHistory, live: priced.length > 0,
    month: data.month.month, flow: summarizeFlow(data.month), attention: pickAttention(visibleAttention(data.attention, dismissed, now)), empty: data.empty,
  };
}
