import { fetchSeries, type Get } from '../../../../convex/lib/priceHistory';
import { denseSeries, gridFor, hasObservedCoverage, type HistoryRange, type PriceSeries } from './intraday';

const NOW = Date.UTC(2026, 9, 18, 14, 37);

describe('dense chart lines from prices', () => {
  it('steps a day every 10 minutes and ends exactly at today’s net worth', () => {
    const grid = gridFor('1D', NOW);
    // Bitcoin doubles over the day; the flat rest of the portfolio is €1,000.
    const btc = { t: grid, p: grid.map((_, i) => 50 + (50 * i) / (grid.length - 1)) };
    const line = denseSeries('1D', NOW, 300_000, [{ symbol: 'btc', kind: 'crypto', valueCents: 200_000 }], { BTC: btc })!;
    expect(line.length).toBe(grid.length + 1);
    expect(line[1].t - line[0].t).toBe(600_000);
    expect(line[0].cents).toBe(100_000 + 100_000);
    expect(line.at(-1)).toEqual({ t: NOW, cents: 300_000 });
  });

  it('keeps positions without a price history at today’s value', () => {
    const grid = gridFor('1W', NOW);
    const eth = { t: grid, p: grid.map(() => 2000) };
    const line = denseSeries('1W', NOW, 500_000, [{ symbol: 'ETH', kind: 'crypto', valueCents: 100_000 }, { symbol: 'TSLA', kind: 'stock', valueCents: 50_000 }], { ETH: eth })!;
    expect(new Set(line.map((p) => p.cents))).toEqual(new Set([500_000]));
  });

  it('gives nothing when no position has a history, so saved points are used instead', () => {
    expect(denseSeries('1M', NOW, 500_000, [{ symbol: 'TSLA', kind: 'stock', valueCents: 50_000 }], {})).toBeNull();
    expect(denseSeries('1M', NOW, 500_000, [], {})).toBeNull();
  });
});

describe('drawing versus actual observation coverage', () => {
  const get: Get = async (url) => {
    const params = new URL(url).searchParams;
    const step = Number(params.get('granularity')) * 1000;
    const start = Date.parse(params.get('start')!), end = Date.parse(params.get('end')!);
    const rows: number[][] = [];
    for (let t = Math.ceil(start / step) * step; t <= end; t += step) rows.push([t / 1000, 90, 110, 100, 100 + (t + step - NOW) / (2 * 365 * 86_400_000), 1]);
    return rows;
  };
  async function observed(range: HistoryRange = '1D'): Promise<PriceSeries> {
    const s = await fetchSeries('BTC', 'crypto', range, NOW, get);
    if (!s) throw new Error('Synthetic Coinbase fixture must provide a drawing');
    return s;
  }
  it('verifies real floor-aligned endpoints, pinned endpoints and the current normalization price', async () => {
    const s = await observed();
    expect(hasObservedCoverage(s, '1D', s.t[0], NOW, NOW)).toBe(true);
    expect(hasObservedCoverage(s, '1D', s.t[0], s.t[40], NOW)).toBe(true);
    const bad = { ...s, p: s.p.map((p, i) => i === 40 ? p + 1 : p) };
    expect(hasObservedCoverage(bad, '1D', s.t[0], s.t[40], NOW)).toBe(false);
    const badAnchor = { ...s, p: s.p.map((p, i) => i === s.p.length - 1 ? p + 1 : p) };
    expect(hasObservedCoverage(badAnchor, '1D', s.t[0], s.t[40], NOW)).toBe(false);
    expect(hasObservedCoverage(s, '1D', s.t[0] - 1, NOW, NOW)).toBe(false);
  });
  it.each<HistoryRange>(['1D', '1W', '1M', '1Y'])('retains verifiable real Coinbase evidence across %s instead of rejecting all resampled grids', async (range) => {
    const s = await observed(range);
    expect(hasObservedCoverage(s, range, s.t[0], NOW, NOW)).toBe(true);
    expect(hasObservedCoverage(s, range, s.t[0], s.t[40], NOW)).toBe(true);
  });
  it('keeps old unverified cache grids drawable without treating them as attribution evidence', async () => {
    const s = await observed(), old = { t: s.t, p: s.p };
    const pieces = [{ symbol: 'BTC', kind: 'crypto' as const, valueCents: 200_000 }];
    expect(denseSeries('1D', NOW, 300_000, pieces, { BTC: old })).toEqual(denseSeries('1D', NOW, 300_000, pieces, { BTC: s }));
    expect(hasObservedCoverage(old, '1D', s.t[0], NOW, NOW)).toBe(false);
  });
  it('rejects corrupt, future, unfinished or retimed observation evidence even with valid drawing arrays', async () => {
    const s = await observed(), o = s.observations!;
    const bad = [
      { ...o, p: o.p.map((p, i) => i ? p : NaN) },
      { ...o, t: o.t.slice(1) },
      { ...o, t: o.t.map((t, i) => i ? t : Infinity) },
      { ...o, t: o.t.map((t, i) => i ? t : o.t[1]) },
      { ...o, t: [...o.t, NOW], p: [...o.p, 99] },
      { ...o, granularityMs: 86_400_000 },
      { ...o, fetchedAt: NOW + 1 },
      { ...o, fetchedAt: o.t[o.t.length - 1] },
    ];
    for (const observations of bad) expect(hasObservedCoverage({ ...s, observations }, '1D', s.t[0], NOW, NOW)).toBe(false);
  });
});
