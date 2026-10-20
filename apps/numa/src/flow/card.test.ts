import type { CloudTransaction } from '@/cloud/api';
import { cashbackShare, formatAmount, monthCashback, noteRepeatsCard, rateText, rowDetails } from './card';

const fx = { usdPerEur: 1.25, asOf: '2026-09-30' };
const tx = (over: Partial<CloudTransaction> = {}): CloudTransaction => ({
  id: 't1', occurredAt: Date.UTC(2026, 8, 27, 14, 21), description: 'Shop', categoryId: null, kind: 'expense', amountMinor: -15114, currency: 'EUR', accountId: null, notes: null, ...over,
});
const card = { issuer: 'ether.fi', last4: '9969', billed: { amount: 171.68, currency: 'USD' }, cashback: { amount: 5.15, currency: 'USD' }, mode: 'Borrow Mode' };

describe('card purchases', () => {
  it('shows the rate the card charged at and the share paid back', () => {
    const t = tx({ card });
    expect(rateText(t)).toBe('1 EUR = 1.1359 USD');
    expect(cashbackShare(t)).toBeCloseTo(0.03, 3);
    expect(rateText(tx({ card: { issuer: 'ether.fi', billed: { amount: 151.14, currency: 'EUR' } } }))).toBeNull();
    expect(cashbackShare(tx())).toBeNull();
  });

  it('adds the card, a foreign amount and the cashback to a list row', () => {
    const r = rowDetails(tx({ card: { ...card, original: { amount: 1420, currency: 'UAH' } } }));
    expect(r.meta.slice(1)).toEqual(['••9969', '₴1,420.00']);
    expect(r.meta[0]).toMatch(/^\d\d:\d\d$/);
    expect(r.extra).toBe('+$5.15 back');
    expect(rowDetails(tx()).extra).toBeNull();
    expect(formatAmount(12.5, 'ZZZ')).toMatch(/12\.50/);
  });

  it('adds up a month’s cashback in the space currency, keeping what it can’t convert as unknown', () => {
    const m = monthCashback([tx({ card }), tx({ id: 't2', card: { issuer: 'ether.fi', cashback: { amount: 2, currency: 'USDC' } } }), tx({ id: 't3' })], 'EUR', fx)!;
    expect(m).toMatchObject({ cents: 412, count: 2, unknown: 1 });
    expect(m.share).toBeCloseTo(0.03, 3);
    expect(monthCashback([tx()], 'EUR', fx)).toBeNull();
  });

  it('hides a note that only repeats the card details', () => {
    expect(noteRepeatsCard(tx({ card, notes: 'ether.fi card •9969 · SHOP · Groceries' }))).toBe(true);
    expect(noteRepeatsCard(tx({ card, notes: 'Shared with Ana' }))).toBe(false);
  });
});
