import type { CloudWallet } from '@/cloud/api';
import type { Attention } from '@/domain/types';
import { walletDetail, walletHolding } from './wallets';

const now = Date.UTC(2026, 9, 12, 12);
const fx = { usdPerEur: 1.25, asOf: '2026-10-12' } as never;
const wallet = (over: Partial<CloudWallet> = {}, snap: Partial<NonNullable<CloudWallet['snapshot']>> | null = {}): CloudWallet => ({
  id: 'w1', label: 'Cold storage', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', addressType: 'bitcoin', includeInNetWorth: true, createdAt: 0,
  snapshot: snap === null ? null : { provider: 'public', totalValueUsd: 40_000, tokens: [{ id: 'bitcoin:native', chainName: 'Bitcoin', symbol: 'BTC', name: 'Bitcoin', quantity: '0.5', valueUsd: 40_000 }], chains: ['bitcoin'], failedChains: [], updatedAt: now - 60_000, partial: false, ...snap },
  ...over,
});

describe('walletHolding', () => {
  it('counts a checked wallet in the home currency, marked with its source', () => {
    const attention: Attention[] = [];
    const h = walletHolding(wallet(), 'EUR', fx, now, attention);
    expect(h).toMatchObject({ id: 'w1', name: 'Cold storage', category: 'crypto', valuation: { kind: 'synced', source: 'mempool.space' } });
    expect(h !== null && h !== 'unconverted' && h.valuation.kind === 'synced' && h.valuation.valueCents).toBeGreaterThan(0);
    expect(attention).toEqual([]);
  });

  it('is unknown, not zero, before the first check', () => {
    expect(walletHolding(wallet({}, null), 'USD', null, now, [])).toMatchObject({ valuation: { kind: 'missing', lastKnownCents: null } });
  });

  it('flags coins without a price and networks it couldn’t reach', () => {
    const attention: Attention[] = [];
    const h = walletHolding(wallet({ addressType: 'evm', label: 'Main' }, {
      totalValueUsd: 5000, chains: ['ethereum'], failedChains: ['base', 'polygon'],
      tokens: [{ id: 'e', chainName: 'Ethereum', symbol: 'ETH', name: 'Ether', quantity: '2', valueUsd: 5000 }, { id: 'x', chainName: 'Ethereum', symbol: 'XYZ', name: 'XYZ', quantity: '10' }],
    }), 'USD', null, now, attention);
    expect(h).toMatchObject({ valuation: { kind: 'missing', lastKnownCents: 500_000 } });
    expect(attention.map((a) => a.title)).toEqual(['Couldn’t check Base and Polygon for Main', 'No price for XYZ in Main']);
  });

  it('counts an Aave deposit as owned and the loan as owed, keeping net worth the same', () => {
    const attention: Attention[] = [];
    const debts: import('@/domain/types').Debt[] = [];
    const h = walletHolding(wallet({ addressType: 'evm', label: 'Main' }, {
      totalValueUsd: 73_000, debtValueUsd: 36_000, chains: ['ethereum', 'base'], failedChains: ['base'], tokenFailedChains: ['base'], defiFailedChains: [],
      tokens: [], defiPositions: [{ id: 'base:aave-v3', chainName: 'Base', protocol: 'Aave V3', label: 'Aave V3', assetValueUsd: 109_000, debtValueUsd: 36_000, healthFactor: 2.5 }],
    }), 'USD', null, now, attention, debts);
    expect(h).toMatchObject({ valuation: { kind: 'synced', valueCents: 10_900_000, source: 'Blockscout and Aave' } });
    expect(debts).toEqual([{ id: 'w1:loan', name: 'Main loan', balanceCents: 3_600_000 }]);
    expect(attention.map((a) => a.title)).toEqual(['Couldn’t check tokens on Base for Main']);
  });

  it('calls out an old balance and leaves out wallets not counted', () => {
    expect(walletHolding(wallet({}, { updatedAt: now - 7 * 3_600_000 }), 'USD', null, now, [])).toMatchObject({ valuation: { kind: 'missing', lastKnownCents: 4_000_000 } });
    expect(walletHolding(wallet({ includeInNetWorth: false }), 'USD', null, now, [])).toBeNull();
    expect(walletHolding(wallet(), 'EUR', null, now, [])).toBe('unconverted');
  });
});

describe('walletDetail', () => {
  it('describes what is inside', () => {
    expect(walletDetail(wallet())).toBe('0.5 BTC');
    expect(walletDetail(wallet({}, null))).toBe('bc1qxy…0wlh');
    const many = wallet({}, { tokens: ['ETH', 'USDC', 'DAI', 'LINK'].map((s) => ({ id: s, chainName: 'Ethereum', symbol: s, name: s, quantity: '1', valueUsd: 1 })) });
    expect(walletDetail(many)).toBe('ETH, USDC and 2 more');
  });
});
