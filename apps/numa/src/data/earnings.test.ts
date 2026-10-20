import { summarize, type CloudEarning } from './earnings';

const NOW = Date.UTC(2026, 10, 20, 12);
const DAY = 86_400_000;
const fx = { usdPerEur: 1.25, asOf: '2026-11-20' };
const day = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
const row = (position: string, extra: Partial<CloudEarning>): CloudEarning => ({
  position, protocol: 'Aave V3', chainName: 'Base', label: 'Aave V3 lending and borrowing', earnedUsd: 0, paidUsd: 0, heldUsd: 0, owedUsd: 0,
  daily: {}, unknown: 0, since: NOW - 40 * DAY, walletId: 'w1', wallet: 'Frame', ...extra,
});

describe('DeFi earnings', () => {
  const rows = [
    row('base:aave', { heldUsd: 36_500, owedUsd: 10_000, daily: { [day(35)]: [100, 25], [day(3)]: [10, 2.5], [day(1)]: [10, 2.5] } }),
    row('wallet:Base:WEETH', { protocol: 'Wallet', label: 'weETH held', heldUsd: 10_000, daily: { [day(2)]: [5, 0] } }),
    row('base:closed', { label: 'Old pool', daily: { [day(39)]: [1, 0] } }),
  ];

  it('adds up earned and interest in the range, in the space currency, with a yearly rate on what is held', () => {
    const w = summarize(rows, '7d', NOW, 'EUR', fx)!;
    // Earned 25 dollars and paid 5 over 7 days: 16 euros net.
    expect(w).toMatchObject({ earnedCents: 2_000, paidCents: 400, netCents: 1_600, days: 7, unknown: 0 });
    expect(w.rate).toBeCloseTo((20 / 46_500) * (365 / 7), 6);
    expect(w.series.map((d) => [d.day, d.earnedCents, d.paidCents, d.netCents, d.totalCents])).toEqual([[day(3), 800, 200, 600, 600], [day(2), 400, 0, 400, 1_000], [day(1), 800, 200, 600, 1_600]]);
    expect(w.strategies.map((s) => [s.name, s.where, s.netCents])).toEqual([['Aave V3 lending and borrowing', 'Frame · Base', 1_200], ['weETH held', 'Frame · Base', 400]]);
  });

  it('shows everything since tracking began, closed strategies included', () => {
    const all = summarize(rows, 'all', NOW, 'USD', null)!;
    expect(all).toMatchObject({ earnedCents: 12_600, paidCents: 3_000, netCents: 9_600 });
    expect(all.strategies.map((s) => s.name)).toContain('Old pool');
  });

  it('says nothing rather than zero without an exchange rate, and has no rate before the first day', () => {
    expect(summarize(rows, 'all', NOW, 'EUR', null)).toBeNull();
    const fresh = summarize([row('base:aave', { since: NOW - 3_600_000, heldUsd: 1_000 })], 'all', NOW, 'USD', null)!;
    expect(fresh).toMatchObject({ netCents: 0, rate: null, series: [] });
  });
});
