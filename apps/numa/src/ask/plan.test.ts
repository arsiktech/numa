import { bindUndo, CREATED, plan } from './plan';
import type { Draft } from './parse';

const fx = { usdPerEur: 1.25, asOf: '2026-10-09' };
const now = 1_790_000_000_000;

describe('plan', () => {
  it('creates a transaction in major units and undoes by deleting it', () => {
    const d: Draft = { type: 'transaction', kind: 'expense', description: ' Coffee ', amountCents: 450, currency: 'EUR', occurredAt: now, categoryId: 'c1', categoryName: 'Dining' };
    const p = plan(d, 'p1', fx, now);
    expect(p).toEqual({
      apply: { fn: 'createTransaction', args: { portfolioId: 'p1', occurredAt: now, description: 'Coffee', kind: 'expense', amount: 4.5, currency: 'EUR', categoryId: 'c1' } },
      undo: { fn: 'deleteTransaction', args: { id: CREATED } },
    });
    if ('undo' in p) expect(bindUndo(p.undo, 'tx9').args.id).toBe('tx9');
  });

  it('updates a known balance and undoes back to the old one', () => {
    const d: Draft = { type: 'asset', name: 'Main account', assetKind: 'cash', amountCents: 1_250_000, currency: 'EUR', existing: { id: 'a1', name: 'Main account', kind: 'cash', balanceCents: 100_000, currency: 'EUR' } };
    const p = plan(d, 'p1', fx, now);
    expect(p).toMatchObject({ apply: { fn: 'upsertAsset', args: { id: 'a1', balance: 12_500 } }, undo: { fn: 'upsertAsset', args: { id: 'a1', balance: 1_000 } } });
  });

  it('adds bought units to a holding in its own currency, converting the price', () => {
    const d: Draft = { type: 'holding', symbol: 'BTC', name: 'Bitcoin', holdingKind: 'crypto', quantity: 0.1, mode: 'add', priceCents: 5_000_000, currency: 'EUR', existing: { id: 'h1', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasisCents: 1_500_000, currency: 'USD', acquiredAt: 7 } };
    // 0.1 × €50,000 = €5,000 = $6,250 at 1.25.
    expect(plan(d, 'p1', fx, now)).toMatchObject({
      apply: { fn: 'upsertHolding', args: { id: 'h1', quantity: 0.6, costBasis: 21_250, currency: 'USD', acquiredAt: 7 } },
      undo: { fn: 'upsertHolding', args: { id: 'h1', quantity: 0.5, costBasis: 15_000 } },
    });
  });

  it('refuses to invent a cost or mix currencies without a rate', () => {
    const base: Draft = { type: 'holding', symbol: 'AAPL', name: 'AAPL', holdingKind: 'stock', quantity: 3, mode: 'set', priceCents: null, currency: 'USD', existing: null };
    expect(plan(base, 'p1', fx, now)).toEqual({ error: 'Add the price you paid per AAPL.' });
    const btc: Draft = { type: 'holding', symbol: 'BTC', name: 'Bitcoin', holdingKind: 'crypto', quantity: 0.1, mode: 'add', priceCents: 5_000_000, currency: 'EUR', existing: { id: 'h1', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasisCents: 1_500_000, currency: 'USD', acquiredAt: 7 } };
    expect(plan(btc, 'p1', null, now)).toMatchObject({ error: expect.stringMatching(/exchange rate/) });
  });

  it('keeps a debt due date only when there is one', () => {
    const d: Draft = { type: 'debt', name: 'Car loan', debtKind: 'loan', amountCents: 2_000_000, currency: 'EUR', dueDate: null, existing: null };
    const p = plan(d, 'p1', fx, now);
    expect('apply' in p && p.apply.args).toEqual({ portfolioId: 'p1', name: 'Car loan', kind: 'loan', balance: 20_000, currency: 'EUR' });
  });
});
