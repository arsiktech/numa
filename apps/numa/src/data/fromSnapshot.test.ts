import type { CloudSnapshot } from '@/cloud/api';
import { summarize } from '@/domain/summary';
import { fromSnapshot } from './fromSnapshot';
import { convertCents, parseFrankfurter, readSavedFx } from './fx';

const now = new Date('2026-10-12T09:00:00Z');
const DAY = 86_400_000;
const fx = { usdPerEur: 1.25, asOf: '2026-10-11' };

function snapshot(over: Partial<CloudSnapshot> = {}): CloudSnapshot {
  return {
    portfolio: { id: 'p1', name: 'Personal', defaultCurrency: 'EUR' },
    categories: [{ id: 'c-rent', name: 'Rent' }],
    transactions: [],
    assets: [],
    liabilities: [],
    holdings: [],
    wealthSnapshots: [],
    ...over,
  };
}

const quoted = {
  id: 'h1', symbol: 'VOO', name: 'Vanguard S&P 500', kind: 'etf' as const, quantity: 10, costBasis: 3000, currency: 'USD' as const,
  marketPrice: 500, changePercent: 1, quoteProvider: 'finnhub' as const, quoteUpdatedAt: now.getTime() - 60_000, quoteStale: false,
};

describe('fx', () => {
  it('converts both ways and refuses without a rate', () => {
    expect(convertCents(10_000, 'EUR', 'USD', fx)).toBe(12_500);
    expect(convertCents(12_500, 'USD', 'EUR', fx)).toBe(10_000);
    expect(convertCents(10_000, 'EUR', 'EUR', null)).toBe(10_000);
    expect(convertCents(10_000, 'USD', 'EUR', null)).toBeNull();
  });
  it('parses the reference rate and rejects junk', () => {
    expect(parseFrankfurter({ date: '2026-10-09', rates: { USD: 1.08 } })).toEqual({ usdPerEur: 1.08, asOf: '2026-10-09' });
    expect(parseFrankfurter({ rates: { USD: 0 } })).toBeNull();
    expect(parseFrankfurter(null)).toBeNull();
  });
  it('reads a saved rate and ignores a corrupt one', () => {
    expect(readSavedFx(JSON.stringify(fx))).toEqual(fx);
    expect(readSavedFx('{oops')).toBeNull();
    expect(readSavedFx(null)).toBeNull();
  });
});

describe('fromSnapshot', () => {
  it('values a quoted holding from the USD quote, converted to the portfolio currency', () => {
    const home = fromSnapshot(snapshot({ holdings: [quoted] }), fx, now);
    expect(home.holdings[0].valuation).toEqual({ kind: 'synced', valueCents: 400_000, asOf: new Date(quoted.quoteUpdatedAt).toISOString(), source: 'Finnhub' });
    expect(home.holdings[0].category).toBe('stocks');
    // +1% today on €4,000 means it was €3,960.40 yesterday.
    expect(home.holdings[0].changeTodayCents).toBe(3_960);
  });

  it('counts an unpriced holding at cost, flagged, never as zero', () => {
    const home = fromSnapshot(snapshot({ holdings: [{ ...quoted, quoteProvider: null, quoteUpdatedAt: null, currency: 'EUR' }] }), fx, now);
    expect(home.holdings[0].valuation).toEqual({ kind: 'missing', lastKnownCents: 300_000, lastKnownAt: null });
    const summary = summarize(home.holdings, home.debts, now);
    expect(summary.ownCents).toBe(300_000);
    expect(summary.stale).toHaveLength(1);
    expect(home.attention.map((a) => a.id)).toContain('quote-h1');
  });

  it('keeps a stale quote at its last price and says so', () => {
    const home = fromSnapshot(snapshot({ holdings: [{ ...quoted, quoteStale: true, quoteUpdatedAt: now.getTime() - 3 * DAY }] }), fx, now);
    expect(home.holdings[0].valuation).toMatchObject({ kind: 'missing', lastKnownCents: 400_000 });
    expect(home.attention[0].title).toBe('VOO price is 3 days old');
  });

  it('treats a mock quote as no price', () => {
    const home = fromSnapshot(snapshot({ holdings: [{ ...quoted, quoteProvider: 'mock' }] }), fx, now);
    expect(home.holdings[0].valuation.kind).toBe('missing');
  });

  it('places assets by kind and liquidity, and moves overdrafts to debts', () => {
    const updatedAt = now.getTime() - DAY;
    const home = fromSnapshot(snapshot({
      assets: [
        { id: 'a1', name: 'Bank', kind: 'cash', balance: 1234.56, currency: 'EUR', updatedAt },
        { id: 'a2', name: 'Flat share', kind: 'real_estate', balance: 90_000, currency: 'EUR', updatedAt },
        { id: 'a3', name: 'Card account', kind: 'cash', balance: -50, currency: 'EUR', updatedAt },
      ],
    }), fx, now);
    const summary = summarize(home.holdings, home.debts, now);
    expect(summary.cashCents).toBe(123_456);
    expect(summary.liquidCents).toBe(123_456);
    expect(summary.ownCents).toBe(9_123_456);
    expect(home.debts).toEqual([{ id: 'a3', name: 'Card account', balanceCents: 5_000 }]);
  });

  it('flags a manual value older than its reminder', () => {
    const home = fromSnapshot(snapshot({ assets: [{ id: 'a2', name: 'Watch', kind: 'collectible', balance: 8000, currency: 'EUR', updatedAt: now.getTime() - 210 * DAY }] }), fx, now);
    expect(home.attention[0]).toMatchObject({ urgency: 'housekeeping', title: 'Watch value is 7 months old' });
  });

  it('raises a due debt in the next 14 days only', () => {
    const liabilities = [
      { id: 'l1', name: 'Card', kind: 'credit_card' as const, balance: 420, currency: 'EUR' as const, dueDate: now.getTime() + 3 * DAY, updatedAt: 0 },
      { id: 'l2', name: 'Mortgage', kind: 'mortgage' as const, balance: 100_000, currency: 'EUR' as const, dueDate: now.getTime() + 40 * DAY, updatedAt: 0 },
    ];
    const home = fromSnapshot(snapshot({ liabilities }), fx, now);
    expect(home.debts.map((d) => d.balanceCents)).toEqual([42_000, 10_000_000]);
    expect(home.attention.map((a) => a.id)).toEqual(['due-l1']);
  });

  it('leaves records out and marks totals unavailable when a rate is missing', () => {
    const home = fromSnapshot(snapshot({ holdings: [quoted], assets: [{ id: 'a1', name: 'Bank', kind: 'cash', balance: 10, currency: 'EUR', updatedAt: now.getTime() }] }), null, now);
    expect(home.unconverted).toEqual(['Vanguard S&P 500']);
    expect(home.holdings.map((h) => h.id)).toEqual(['a1']);
    expect(home.attention.map((a) => a.id)).toContain('fx');
  });

  it('sums this month by category and ignores other months', () => {
    const transactions = [
      { id: 't1', occurredAt: now.getTime() - DAY, description: 'Client A', categoryId: null, kind: 'income' as const, amountMinor: 500_000, currency: 'EUR' as const },
      { id: 't2', occurredAt: now.getTime() - 2 * DAY, description: 'October rent', categoryId: 'c-rent', kind: 'expense' as const, amountMinor: 120_000, currency: 'EUR' as const },
      { id: 't3', occurredAt: now.getTime() - 40 * DAY, description: 'Old', categoryId: null, kind: 'expense' as const, amountMinor: 999_999, currency: 'EUR' as const },
    ];
    const home = fromSnapshot(snapshot({ transactions }), fx, now);
    expect(home.month).toEqual({
      month: 'October',
      incoming: [{ id: 'Client A', label: 'Client A', cents: 500_000 }],
      outgoing: [{ id: 'Rent', label: 'Rent', cents: 120_000 }],
    });
  });

  it('orders saved net-worth points and converts them', () => {
    const wealthSnapshots = [
      { takenAt: now.getTime() - DAY, netWorth: 125, currency: 'USD' as const },
      { takenAt: now.getTime() - 2 * DAY, netWorth: 90, currency: 'EUR' as const },
    ];
    expect(fromSnapshot(snapshot({ wealthSnapshots }), fx, now).history.map((p) => p.cents)).toEqual([9_000, 10_000]);
  });

  it('calls a new portfolio empty', () => {
    expect(fromSnapshot(snapshot({ assets: [{ id: 'a1', name: 'Cash', kind: 'cash', balance: 0, currency: 'EUR', updatedAt: 0 }] }), fx, now).empty).toBe(true);
  });
});
