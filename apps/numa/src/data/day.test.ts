import type { CloudWealthSnapshot } from '@/cloud/api';
import { dayDetails, dayGroupOf } from './day';

const T = Date.parse('2026-02-20T12:00:00Z');
const saved: CloudWealthSnapshot = {
  takenAt: T, netWorth: 25000, liquid: 0, invested: 11000, hardAssets: 20000, liabilities: 6000, currency: 'EUR',
  lines: [
    { group: 'liquid', name: 'EUR', amount: -4000 },
    { group: 'crypto', name: 'STABLE$', amount: -2000 },
    { group: 'crypto', name: 'BTC', amount: 7000 },
    { group: 'crypto', name: 'ETH', amount: 3500 },
    { group: 'stocks', name: 'TESLA', amount: 500 },
    { group: 'hard', name: 'Real estate', amount: 12000 },
    { group: 'hard', name: 'Car', amount: 8000 },
  ],
};

describe('a saved date in detail', () => {
  it('puts each position in its part, largest first, with owed amounts positive', () => {
    const day = dayDetails([saved], T, 'EUR', null)!;
    expect(day.detailed).toBe(true);
    expect(day.netCents).toBe(2_500_000);
    expect(day.sections.map((s) => [s.group, s.cents])).toEqual([['invested', 1_100_000], ['hard', 2_000_000], ['owe', 600_000]]);
    expect(day.sections[0].lines.map((l) => `${l.name} ${l.kind} ${l.cents}`)).toEqual(['BTC Crypto 700000', 'ETH Crypto 350000', 'TESLA Stocks 50000']);
    expect(day.sections[2].lines.map((l) => l.name)).toEqual(['EUR', 'STABLE$']);
    // Every part's lines add up to the part, so the details never disagree with the chart.
    for (const s of day.sections) expect(s.lines.reduce((t, l) => t + l.cents, 0)).toBe(s.cents);
  });

  it('shows only totals for a date saved without positions', () => {
    const day = dayDetails([{ ...saved, lines: null }], T, 'EUR', null)!;
    expect(day.detailed).toBe(false);
    expect(day.sections.every((s) => s.lines.length === 0)).toBe(true);
  });

  it('converts to the space currency when a rate is known, and keeps the saved currency when not', () => {
    expect(dayDetails([saved], T, 'USD', { usdPerEur: 1.25, asOf: '2026-10-13' })!).toMatchObject({ currency: 'USD', netCents: 3_125_000 });
    expect(dayDetails([saved], T, 'USD', null)!).toMatchObject({ currency: 'EUR', netCents: 2_500_000 });
  });

  it('is null for a date that was never saved', () => {
    expect(dayDetails([saved], T + 1, 'EUR', null)).toBeNull();
  });

  it('maps Home blocks to parts', () => {
    expect([dayGroupOf('cash'), dayGroupOf('stocks'), dayGroupOf('crypto'), dayGroupOf('property'), dayGroupOf('debts'), dayGroupOf('all')]).toEqual(['liquid', 'invested', 'invested', 'hard', 'owe', undefined]);
  });
});
