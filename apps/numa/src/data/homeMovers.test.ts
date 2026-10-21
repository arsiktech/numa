import type { CloudHolding, CloudSnapshot, CloudWallet } from '@/cloud/api';
import { summarize } from '@/domain/summary';
import { fetchSeries, type Get } from '../../../../convex/lib/priceHistory';
import { fromSnapshot } from './fromSnapshot';
import { readSavedFx, type FxRate } from './fx';
import { homeMovementReport, type MovementBasis } from './homeMovers';
import { denseSeries, gridFor, pricedPiecesOf, pricedValueAt, validPriceSeries, type HistoryRange, type PriceSeries } from './intraday';
import { itemsFrom } from './items';
import { spotDetail, type Spot } from './positions';
import { todayFromMarkets } from './series';

const NOW = Date.UTC(2026, 0, 20, 12);
const DAY = 86_400_000;
const holding = (over: Partial<CloudHolding> = {}): CloudHolding => ({
  id: 'synthetic-holding', acquiredAt: 0, symbol: 'XTK', name: 'Example token', kind: 'crypto', quantity: 3,
  costBasis: 120, currency: 'USD', marketPrice: 100, changePercent: 25, quoteProvider: 'coingecko', quoteUpdatedAt: NOW - 60_000, quoteStale: false, ...over,
});
const wallet = (over: Partial<CloudWallet> = {}): CloudWallet => ({
  id: 'synthetic-wallet', label: 'Example wallet', address: '0x0000000000000000000000000000000000000001', addressType: 'evm', includeInNetWorth: true, createdAt: 0,
  snapshot: { provider: 'public', totalValueUsd: 180, debtValueUsd: 20, tokens: [{ id: 'synthetic-token', chainName: 'example', symbol: 'XTK', name: 'Example token', quantity: '2', valueUsd: 200 }], chains: ['example'], failedChains: [], updatedAt: NOW - 60_000, partial: false },
  ...over,
});
const snapshot = (over: Partial<CloudSnapshot> = {}): CloudSnapshot => ({
  portfolio: { id: 'synthetic-space', name: 'Example space', defaultCurrency: 'USD' }, categories: [], transactions: [], assets: [], liabilities: [], holdings: [], wallets: [], wealthSnapshots: [], ...over,
});
function source(s: CloudSnapshot, fx: FxRate | null = null) {
  const data = fromSnapshot(s, fx, new Date(NOW));
  const items = itemsFrom(s, data, NOW, fx);
  const summary = summarize(data.holdings, data.debts, new Date(NOW));
  const pieces = pricedPiecesOf(items);
  return { data, items, summary, pieces, fx };
}
function report(s: ReturnType<typeof source>, basis: MovementBasis, headlineCents: number, from = NOW - DAY, to = NOW) {
  return homeMovementReport({ items: s.items, basis, headlineCents, from, to, now: NOW, range: '1D', lens: 'net', currency: s.data.currency, fx: s.fx });
}
const reconciled = (r: ReturnType<typeof report>) => [...r.movers.gainers, ...r.movers.losers].reduce((sum, row) => sum + row.cents, 0) + (r.movers.unexplainedCents ?? 0);

// Synthetic provider payloads through the REAL backend adapter: never an ideal drawing
// grid passed off as an observation. Coinbase returns raw [start, low, high, open, close, volume].
const candleGet = (price: (close: number) => number, omit: (close: number) => boolean = () => false): Get => async (url) => {
  const params = new URL(url).searchParams;
  const step = Number(params.get('granularity')) * 1000;
  const start = Date.parse(params.get('start')!);
  const end = Date.parse(params.get('end')!);
  const rows: number[][] = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    const p = price(t + step);
    if (!omit(t + step)) rows.push([t / 1000, p, p, p, p, 1]);
  }
  return rows.reverse();
};
async function realHistory(range: HistoryRange = '1D', get = candleGet((t) => 50 + 50 * (t - (NOW - DAY)) / DAY), now = NOW): Promise<PriceSeries> {
  const series = await fetchSeries('XTK', 'crypto', range, now, get);
  if (!series) throw new Error('Synthetic provider fixture must produce a drawing');
  return series;
}

describe('Home movement evidence', () => {
  it('explains the exact dense chart endpoints using the chart calculation, with no wallet double counting', async () => {
    const s = source(snapshot({ holdings: [holding()], wallets: [wallet()] }));
    const series = await realHistory();
    const history = { XTK: series };
    const line = denseSeries('1D', NOW, s.summary.netCents, s.pieces, history)!;
    const headline = line[line.length - 1].cents - line[0].cents;
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history }, headline, line[0].t);
    expect(r.movers.gainers).toHaveLength(1);
    expect(r.movers.gainers[0].cents).toBe(25_000);
    expect(r.movers.gainers[0].id).toBe('crypto:XTK');
    expect(r.movers.coverage.some((c) => c.id === 'record:synthetic-wallet:loan')).toBe(true);
    expect(r.movers.gainers.some((row) => row.id === 'record:synthetic-wallet')).toBe(false);
    expect(reconciled(r)).toBe(headline);
    expect(r.movers.unexplainedCents).toBe(0);
  });
  it('uses a pinned endpoint, rather than explaining current daily quotes against a past date', async () => {
    const s = source(snapshot({ holdings: [holding()] }));
    const series = await realHistory('1D', candleGet((t) => 50 + (t - (NOW - DAY)) / 600_000));
    const history = { XTK: series };
    const line = denseSeries('1D', NOW, s.summary.netCents, s.pieces, history)!;
    const picked = line[40], headline = picked.cents - line[0].cents;
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history }, headline, line[0].t, picked.t);
    expect(r.to).toBe(picked.t);
    expect(r.movers.gainers[0].cents).toBe(Math.round(pricedValueAt(s.pieces[0], series, picked.t)! - pricedValueAt(s.pieces[0], series, line[0].t)!));
    expect(reconciled(r)).toBe(headline);
  });
  it('uses the same daily quote deltas as the Home fallback, leaving cash and debts explicitly uncovered', () => {
    const s = source(snapshot({ holdings: [holding()], assets: [{ id: 'synthetic-bank', kind: 'cash', name: 'Example bank', balance: 10, currency: 'USD', updatedAt: NOW }], liabilities: [{ id: 'synthetic-loan', name: 'Example loan', kind: 'loan', balance: 20, currency: 'USD', dueDate: null, updatedAt: NOW }] }));
    const delta = s.data.holdings.reduce((sum, h) => sum + (h.changeTodayCents ?? 0), 0);
    const line = todayFromMarkets(NOW, s.summary.netCents, delta)!.points;
    const r = report(s, { kind: 'quotes' }, line[1].cents - line[0].cents, line[0].t);
    expect(r.movers.gainers[0].cents).toBe(6000);
    expect(r.movers.coverage.map((c) => c.name).sort()).toEqual(['Example bank', 'Example loan']);
    expect(r.notes.join(' ')).toContain('different session starts');
    expect(reconciled(r)).toBe(delta);
  });
  it('does not assign stale, missing or nonfinite quote changes a zero move', () => {
    const s = source(snapshot({ holdings: [holding({ id: 'old', quoteStale: true }), holding({ id: 'missing', symbol: 'YTK', quoteProvider: null, quoteUpdatedAt: null }), holding({ id: 'bad', symbol: 'ZTK', changePercent: NaN })] }));
    const r = report(s, { kind: 'quotes' }, 100);
    expect(r.movers.gainers).toEqual([]);
    expect(r.movers.coverage).toHaveLength(3);
    expect(r.movers.coverage.every((c) => !c.flat)).toBe(true);
    expect(r.movers.unexplainedCents).toBe(100);
  });
  it('keeps incomplete wallets out of estimates and excludes uncounted wallets entirely', () => {
    const w = wallet();
    const s = source(snapshot({ wallets: [wallet({ snapshot: { ...w.snapshot!, partial: true } }), wallet({ id: 'ignored-wallet', label: 'Ignored wallet', includeInNetWorth: false })] }));
    const grid = gridFor('1D', NOW), history = { XTK: { t: grid, p: grid.map(() => 100) } };
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history }, 20);
    expect(r.movers.gainers).toEqual([]);
    expect(r.movers.coverage.some((c) => c.reason.includes('incomplete'))).toBe(true);
    expect(r.movers.coverage.some((c) => c.name === 'Ignored wallet')).toBe(false);
  });
  it('marks missing FX as unavailable coverage, and rounds USD and EUR estimates to their own cents', () => {
    const s = snapshot({ portfolio: { id: 'synthetic-eur', name: 'Example euro space', defaultCurrency: 'EUR' }, holdings: [holding({ quantity: 1.01, marketPrice: 123.45 })] });
    const noFx = source(s);
    expect(noFx.items[0].valueCents).toBeNull();
    expect(report(noFx, { kind: 'quotes' }, 10).movers.coverage[0].reason).toContain('unavailable');
    const eur = source(s, { usdPerEur: 1.2, asOf: '2026-01-20' });
    const delta = eur.items[0].changeTodayCents!;
    const r = report(eur, { kind: 'quotes' }, delta);
    expect(Number.isInteger(r.movers.gainers[0].cents)).toBe(true);
    expect(reconciled(r)).toBe(delta);
  });
  it('does not explain saved baselines with today’s quotes, deposits or transaction P&L', () => {
    const s = source(snapshot({ holdings: [holding()], transactions: [{ id: 'synthetic-income', occurredAt: NOW - 1000, description: 'Example income', categoryId: null, kind: 'income', amountMinor: 8000, currency: 'USD', accountId: null, notes: null }] }));
    const r = report(s, { kind: 'saved' }, 9000, NOW - 7 * DAY);
    expect(r.movers.gainers).toEqual([]); expect(r.movers.losers).toEqual([]);
    expect(r.movers.unexplainedCents).toBe(9000);
    expect(r.movers.coverage[0].reason).toContain('baseline');
    const quotes = report(s, { kind: 'quotes' }, 9000);
    expect(quotes.movers.gainers[0].cents).toBe(6000);
    expect(quotes.movers.unexplainedCents).toBe(3000);
  });
  it('calls out quantities acquired after the baseline instead of inventing their earlier value', () => {
    const s = source(snapshot({ holdings: [holding({ acquiredAt: NOW - 1000 })] }));
    const r = report(s, { kind: 'quotes' }, 6000);
    expect(r.movers.gainers).toEqual([]);
    expect(r.movers.coverage[0].reason).toContain('Acquired after');
    expect(r.movers.unexplainedCents).toBe(6000);
  });
  it('rejects histories that do not cover Home’s baseline or have an invalid ratio', () => {
    const s = source(snapshot({ holdings: [holding()] }));
    const history = { XTK: { t: [NOW - 1000, NOW], p: [50, 100] } };
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history }, 6000);
    expect(r.movers.gainers).toEqual([]);
    expect(r.movers.coverage[0].reason).toContain('endpoints');
    expect(validPriceSeries({ t: [1, 2], p: [1, NaN] })).toBe(false);
    expect(validPriceSeries({ t: [2, 1], p: [1, 2] })).toBe(false);
    expect(validPriceSeries({ t: [1], p: [1, 2] })).toBe(false);
    expect(denseSeries('1D', NOW, 30000, s.pieces, { XTK: { t: [NOW - DAY, NOW], p: [50, 0] } })).toBeNull();
  });
  it('supports a longer dense range using the same endpoints and its own period label', async () => {
    const s = source(snapshot({ holdings: [holding()] }));
    const history = { XTK: await realHistory('1W', candleGet((t) => 100 - (t - (NOW - 7 * DAY)) / (4 * 3_600_000))) };
    const line = denseSeries('1W', NOW, s.summary.netCents, s.pieces, history)!;
    const headline = line[line.length - 1].cents - line[0].cents;
    const r = homeMovementReport({ items: s.items, basis: { kind: 'history', range: '1W', pieces: s.pieces, history }, headlineCents: headline, from: line[0].t, to: NOW, now: NOW, range: '1W', lens: 'net', currency: s.data.currency, fx: s.fx });
    expect(r.range).toBe('1W'); expect(r.movers.losers).toHaveLength(1);
    expect(reconciled(r)).toBe(headline);
  });
  it('labels demo contributions as simulated and reconciles the exact selected demo lens headline', () => {
    const r = homeMovementReport({ items: [], basis: { kind: 'demo' }, headlineCents: 4321, from: NOW - DAY, to: NOW, now: NOW, range: '1D', lens: 'net', currency: 'EUR', fx: null });
    expect(r.demo).toBe(true); expect(r.basis).toContain('Simulated');
    expect(r.movers.gainers.length).toBeGreaterThan(0); expect(r.movers.losers.length).toBeGreaterThan(0);
    expect(reconciled(r)).toBe(4321);
    expect(r.notes[0]).toContain('fictional');
  });
  it('reuses the exact By place subtitle for the includes line', () => {
    const spot: Spot = { key: 'example', name: 'Example place', items: [], assets: ['XTK', 'YTK', 'ZTK', 'ATK', 'BTK', 'CTK'], valueCents: 12300, unknown: 1 };
    expect(spotDetail(spot)).toBe('XTK, YTK, ZTK, ATK +2 · 1 without a value');
  });

  it.each(['late start', 'early end', 'internal gap', 'pinned gap', 'old cache'] as const)('leaves %s in real resampled history unattributed, never flat', async (scenario) => {
    const s = source(snapshot({ holdings: [holding()] }));
    const from = NOW - DAY, hour = 3_600_000;
    const omit = (t: number) => scenario === 'late start' ? t < from + hour : scenario === 'early end' ? t > NOW - hour :
      (scenario === 'internal gap' || scenario === 'pinned gap') && t > from + 6 * hour && t < from + 9 * hour;
    const fetched = await realHistory('1D', candleGet(() => 100, omit));
    const series: PriceSeries = scenario === 'old cache' ? { t: fetched.t, p: fetched.p } : fetched;
    expect(series.t).toEqual(gridFor('1D', NOW)); // The padded drawing alone still looks complete.
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history: { XTK: series } }, 6000, from, scenario === 'pinned gap' ? from + 7 * hour : NOW);
    expect(r.movers.gainers).toEqual([]); expect(r.movers.losers).toEqual([]);
    expect(r.movers.coverage[0].flat).toBe(false);
    expect(r.movers.coverage[0].reason).toContain('observations');
    expect(r.movers.unexplainedCents).toBe(6000); expect(reconciled(r)).toBe(6000);
  });

  it('does not promote Yahoo previous-close padding to an actual baseline observation', async () => {
    const s = source(snapshot({ holdings: [holding({ kind: 'stock', quoteProvider: 'finnhub' })] }));
    const first = NOW - 2 * 3_600_000;
    const series = await fetchSeries('XTK', 'stock', '1D', NOW, async () => ({ chart: { result: [{
      meta: { currency: 'USD', chartPreviousClose: 80 }, timestamp: [first / 1000, (first + 300_000) / 1000],
      indicators: { quote: [{ close: [95, 100] }] },
    }] } }));
    expect(series?.p[0]).toBe(80);
    expect(series?.observations?.t).not.toContain(first - 1);
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history: { XTK: series! } }, 6000);
    expect(r.movers.gainers).toEqual([]); expect(r.movers.unexplainedCents).toBe(6000);
    expect(r.movers.coverage[0].reason).toContain('endpoints');
  });

  it('keeps the original age of a provider-fallback series despite a fresh current holding quote', async () => {
    const s = source(snapshot({ holdings: [holding()] }));
    const series = await realHistory('1D', candleGet(() => 100), NOW - 6 * 3_600_000);
    const r = report(s, { kind: 'history', range: '1D', pieces: s.pieces, history: { XTK: series } }, 6000);
    expect(series.observations?.fetchedAt).toBe(NOW - 6 * 3_600_000);
    expect(r.movers.gainers).toEqual([]); expect(r.movers.unexplainedCents).toBe(6000);
  });

  it('preserves a last-known EUR headline but rejects months-old cached FX with a fresh security quote', async () => {
    const fx = readSavedFx(JSON.stringify({ usdPerEur: 1.2, asOf: '2025-06-03' }));
    const s = source(snapshot({ portfolio: { id: 'synthetic-eur', name: 'Example euro space', defaultCurrency: 'EUR' }, holdings: [holding()] }), fx);
    expect(s.data.unconverted).toEqual([]); expect(s.items[0].freshness.tone).toBe('live');
    const delta = s.items[0].changeTodayCents!;
    const history = { XTK: await realHistory() };
    for (const basis of [{ kind: 'quotes' }, { kind: 'history', range: '1D', pieces: s.pieces, history }] satisfies MovementBasis[]) {
      const r = report(s, basis, delta);
      expect(r.movers.gainers).toEqual([]); expect(r.movers.losers).toEqual([]);
      expect(r.movers.coverage[0].flat).toBe(false);
      expect(r.movers.coverage[0].reason).toContain('exchange rate');
      expect(r.movers.unexplainedCents).toBe(delta); expect(reconciled(r)).toBe(delta);
    }
  });

  it('requires current FX for USD wallet prices in EUR, while USD portfolios ignore irrelevant FX and cost currency', async () => {
    const stale = { usdPerEur: 1.2, asOf: '2025-06-03' };
    const eur = source(snapshot({ portfolio: { id: 'synthetic-eur', name: 'Example euro space', defaultCurrency: 'EUR' }, wallets: [wallet()] }), stale);
    const history = { XTK: await realHistory() };
    expect(report(eur, { kind: 'history', range: '1D', pieces: eur.pieces, history }, 6000).movers.gainers).toEqual([]);
    for (const fx of [null, stale, { usdPerEur: Infinity, asOf: 'bad' }]) {
      const usd = source(snapshot({ holdings: [holding({ currency: 'EUR' })] }), fx);
      const r = report(usd, { kind: 'quotes' }, 6000);
      expect(r.movers.gainers[0].cents).toBe(6000); expect(reconciled(r)).toBe(6000);
    }
  });

  it.each(['bad date', '2026-02-30', '2026-01-21'])('keeps a EUR daily headline unattributed when cached FX has invalid/future date %s', (asOf) => {
    const s = source(snapshot({ portfolio: { id: 'synthetic-eur', name: 'Example euro space', defaultCurrency: 'EUR' }, holdings: [holding()] }), { usdPerEur: 1.2, asOf });
    const delta = s.items[0].changeTodayCents!;
    const line = todayFromMarkets(NOW, s.summary.netCents, delta)!.points;
    const r = report(s, { kind: 'quotes' }, line[1].cents - line[0].cents, line[0].t);
    expect(r.movers.gainers).toEqual([]); expect(r.movers.coverage[0].flat).toBe(false);
    expect(r.movers.unexplainedCents).toBe(delta); expect(reconciled(r)).toBe(delta);
  });

  it('permits price-only EUR attribution across a valid five-day FX publication gap', () => {
    const s = source(snapshot({ portfolio: { id: 'synthetic-eur', name: 'Example euro space', defaultCurrency: 'EUR' }, holdings: [holding()] }), { usdPerEur: 1.2, asOf: '2026-01-15' });
    const delta = s.items[0].changeTodayCents!;
    const r = report(s, { kind: 'quotes' }, delta);
    expect(r.movers.gainers[0].cents).toBe(delta); expect(r.movers.unexplainedCents).toBe(0);
  });

  it('keeps manual funds classified as stocks with no invented market-price evidence', () => {
    const s = source(snapshot({ assets: [{ id: 'synthetic-fund', kind: 'other', investmentType: 'fund', name: 'Example manual fund', balance: 500, currency: 'USD', updatedAt: NOW }] }));
    expect(s.items[0].group).toBe('stocks'); expect(s.pieces).toEqual([]);
    const r = report(s, { kind: 'quotes' }, 6000);
    expect(r.movers.gainers).toEqual([]); expect(r.movers.coverage[0].flat).toBe(false);
    expect(r.movers.unexplainedCents).toBe(6000);
  });
});
