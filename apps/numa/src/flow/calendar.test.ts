import type { CloudTransaction } from '@/cloud/api';
import { monthCalendar, versusAverage } from './calendar';

const fx = { usdPerEur: 1.25, asOf: '2026-09-30' };
const at = (day: number, h = 12) => new Date(2026, 8, day, h).getTime();
const tx = (id: string, day: number, cents: number, extra: Partial<CloudTransaction> = {}): CloudTransaction => ({
  id, occurredAt: at(day), description: id, categoryId: null, kind: 'expense', amountMinor: -cents, currency: 'EUR', accountId: null, notes: null, ...extra,
});

describe('spending calendar', () => {
  const k = { year: 2026, month: 8 };
  it('adds up each day in the space currency and shades the biggest days darkest', () => {
    const cal = monthCalendar([tx('a', 3, 10_000), tx('b', 3, 2_500, { currency: 'USD' }), tx('c', 12, 400), tx('pay', 15, 500_000, { kind: 'income' })], k, 'EUR', fx, at(30));
    // 1 Sep 2026 is a Tuesday: one blank before it in a Monday-first week.
    expect(cal.lead).toBe(1);
    expect(cal.days).toHaveLength(30);
    expect(cal.days[2]).toMatchObject({ spentCents: 12_000, count: 2, level: 4, txIds: ['a', 'b'] });
    expect(cal.days[11]).toMatchObject({ spentCents: 400, level: 1 });
    expect(cal.days[14]).toMatchObject({ spentCents: 0, income: true, level: 0 });
    expect(cal.averageCents).toBe(Math.round(12_400 / 30));
  });

  it('keeps spending it can’t convert as unknown, not zero, and averages only days so far', () => {
    const cal = monthCalendar([tx('a', 2, 1_000, { currency: 'USD' }), tx('b', 4, 3_000)], k, 'EUR', null, at(10, 23));
    expect(cal.days[1]).toMatchObject({ spentCents: 0, unknown: 1, level: 0 });
    expect(cal.averageCents).toBe(300);
  });

  it('says how a day compares with the average', () => {
    const cal = monthCalendar([tx('a', 3, 10_000)], k, 'EUR', fx, at(30));
    expect(versusAverage(cal.days[2], 4_000)).toBe('2.5× your daily average');
    expect(versusAverage({ ...cal.days[2], spentCents: 1_000 }, 4_000)).toBe('75% under your daily average');
    expect(versusAverage(cal.days[5], 4_000)).toBeNull();
  });
});
