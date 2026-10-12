import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cloud, type CloudBootstrap, type CloudCurrency } from '@/cloud/api';
import { storage } from '@/cloud/storage';
import { pickAttention } from '@/domain/attention';
import { summarizeFlow, type FlowSummary } from '@/domain/flow';
import { summarize, type Summary } from '@/domain/summary';
import type { Attention, Currency } from '@/domain/types';
import { demoAttention, demoDebts, demoHoldings, demoNow, demoOctober, demoPoints } from './demo';
import { fromSnapshot } from './fromSnapshot';
import { parseFrankfurter, readSavedFx, type FxRate } from './fx';
import { seriesFor, todayFromMarkets, type Point, type Range } from './series';

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
    month: 'October', flow: summarizeFlow(demoOctober), attention: pickAttention(demoAttention), empty: false,
  };
}

const FX_KEY = 'numa.fx.v1';

/** Today's ECB euro-dollar rate, falling back to the last one this device saw. */
function useFx(): { fx: FxRate | null; settled: boolean } {
  const [fx, setFx] = useState<FxRate | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
        const rate = res.ok ? parseFrankfurter(await res.json()) : null;
        if (rate) { if (alive) setFx(rate); void storage.setItem(FX_KEY, JSON.stringify(rate)); return; }
      } catch { /* offline: use the saved rate */ }
      const saved = readSavedFx(await storage.getItem(FX_KEY));
      if (alive) setFx(saved);
    })().finally(() => alive && setSettled(true));
    return () => { alive = false; };
  }, []);
  return { fx, settled };
}

function newMutationId(op: string) {
  return `${op}:mut_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** The signed-in person's first portfolio, live from Convex. */
export function useCloudHome(range: Range): HomeModel & { profile?: CloudBootstrap['profile'] } {
  const bootstrap = useMutation(cloud.bootstrap);
  const createPortfolio = useMutation(cloud.createPortfolio);
  const [boot, setBoot] = useState<CloudBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { fx, settled } = useFx();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    bootstrap({}).then((b) => alive && setBoot(b), () => alive && setError('Couldn’t reach Numa. Check your connection and try again.'));
    return () => { alive = false; };
  }, [bootstrap, attempt]);

  // Re-evaluate freshness every minute so stale prices are called out without a reload.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  const portfolioId = boot?.selectedPortfolioId ?? null;
  const snapshot = useQuery(cloud.portfolioSnapshot, portfolioId ? { portfolioId } : 'skip');
  const retry = useCallback(() => { setError(null); setAttempt((a) => a + 1); }, []);
  const create = useCallback(async (currency: CloudCurrency) => {
    await createPortfolio({ name: 'Personal', type: 'personal', tagline: '', defaultCurrency: currency, seedDefaults: true, clientMutationId: newMutationId('portfolios.create') });
    setAttempt((a) => a + 1);
  }, [createPortfolio]);

  const data = useMemo(() => (snapshot && settled ? fromSnapshot(snapshot, fx, new Date(now)) : null), [snapshot, settled, fx, now]);
  const summary = useMemo(() => (data ? summarize(data.holdings, data.debts, new Date(now)) : null), [data, now]);

  if (error) return { status: 'error', message: error, retry };
  if (boot && !portfolioId) return { status: 'needsSpace', create, profile: boot.profile };
  if (!data || !summary) return { status: 'loading' };
  const priced = data.holdings.filter((h) => h.valuation.kind === 'synced');
  const marketsToday = priced.length ? priced.reduce((sum, h) => sum + (h.changeTodayCents ?? 0), 0) : null;
  const today = range === '1D' ? todayFromMarkets(now, summary.netCents, marketsToday) : null;
  const { points, hasHistory } = today ?? seriesFor(data.history, now, summary.netCents, range);
  return {
    status: 'ready', source: 'cloud', now, currency: data.currency, summary, available: data.unconverted.length === 0,
    points, hasHistory, live: priced.length > 0,
    month: data.month.month, flow: summarizeFlow(data.month), attention: pickAttention(data.attention), empty: data.empty,
    profile: boot?.profile,
  };
}
