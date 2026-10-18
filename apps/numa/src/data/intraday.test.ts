import { denseSeries, gridFor } from './intraday';

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
