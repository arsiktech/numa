import type { CloudWallet } from '@/cloud/api';
import { squarify } from '@/ui/treemapLayout';
import { demoHoldings } from './demo';
import type { Item } from './items';
import { positionsOf, walletPieces } from './positions';
import { useDemoItems } from './useItems';

const fx = { usdPerEur: 1.25, asOf: '2026-10-17' } as never;
const fresh = { text: 'Live', tone: 'live' as const };
const holding = (id: string, symbol: string, name: string, quantity: number, cents: number): Item => ({
  id, type: 'holding', group: 'crypto', name, detail: `${quantity} ${symbol}`, valueCents: cents, changeTodayCents: null, freshness: fresh,
  raw: { id, symbol, name, kind: 'crypto', quantity, costBasis: 1, currency: 'EUR', acquiredAt: 0 } as never,
});
const wallet: CloudWallet = {
  id: 'w1', label: 'Ledger', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', addressType: 'evm', includeInNetWorth: true, createdAt: 0,
  snapshot: { provider: 'public', totalValueUsd: 0, chains: [], failedChains: [], updatedAt: 0, partial: false,
    tokens: [
      { id: 'base:btc', chainName: 'Base', symbol: 'BTC', name: 'Coinbase Wrapped BTC', quantity: '0.5', valueUsd: 50_000 },
      { id: 'eth:usdc', chainName: 'Ethereum', symbol: 'USDC', name: 'USDC', quantity: '125', valueUsd: 125 },
      { id: 'eth:junk', chainName: 'Ethereum', symbol: 'XYZ', name: 'XYZ', quantity: '9' },
    ],
    defiPositions: [{ id: 'base:aave-v3', chainName: 'Base', protocol: 'Aave V3', label: 'Aave V3', assetValueUsd: 1000, debtValueUsd: 400 }] },
};

describe('positions', () => {
  it('merges one coin across records and wallets, and lists every place it sits', () => {
    const items: Item[] = [
      holding('h1', 'BTC', 'Bitcoin', 1, 9_000_000),
      { id: 'w1', type: 'wallet', group: 'crypto', name: 'Ledger', detail: null, valueCents: 0, changeTodayCents: null, freshness: fresh, raw: wallet, pieces: walletPieces(wallet, 'EUR', fx) },
    ];
    const [btc, ...rest] = positionsOf(items, 'crypto');
    expect(btc).toMatchObject({ key: 'BTC', name: 'Bitcoin', quantity: 1.5, valueCents: 9_000_000 + 4_000_000, unknown: 0 });
    expect(btc.places.map((p) => [p.where, p.detail, p.quantity])).toEqual([['Your record', 'Live', 1], ['Ledger', 'bc1qxy…0wlh · Base', 0.5]]);
    expect(rest.map((p) => [p.key, p.valueCents])).toEqual([['lent:Aave V3', 80_000], ['USDC', 10_000], ['XYZ', 0]]);
    expect(rest.find((p) => p.key === 'XYZ')).toMatchObject({ unknown: 1, quantity: 9 });
  });

  it('keeps a wallet token without an exchange rate unknown, not zero', () => {
    expect(walletPieces(wallet, 'EUR', null).every((p) => p.valueCents === null)).toBe(true);
    expect(walletPieces({ ...wallet, snapshot: null }, 'EUR', fx)).toEqual([]);
  });

  it('groups cash by currency across accounts', () => {
    const acct = (id: string, currency: string, cents: number): Item => ({ id, type: 'asset', group: 'cash', name: id, detail: 'Cash account', valueCents: cents, changeTodayCents: null, freshness: fresh, raw: { id, currency } as never });
    const out = positionsOf([acct('Revolut EUR', 'EUR', 100), acct('N26', 'EUR', 50), acct('Chase', 'USD', 70)], 'cash');
    expect(out.map((p) => [p.name, p.valueCents, p.places.map((x) => x.where)])).toEqual([['Euro', 150, ['Revolut EUR', 'N26']], ['US dollar', 70, ['Chase']]]);
  });

  it('shows the demo Bitcoin across a hardware wallet, an exchange and a loan, adding up exactly', () => {
    const src = useDemoItems();
    if (src.status !== 'ready') throw new Error('demo');
    const btc = positionsOf(src.items, 'crypto').find((p) => p.key === 'BTC')!;
    const records = demoHoldings.filter((h) => h.id.startsWith('btc')).reduce((t, h) => t + (h.valuation.kind === 'missing' ? 0 : h.valuation.valueCents), 0);
    expect(btc.places.map((p) => p.where)).toEqual(['Ledger', 'Nexo', 'Coinbase']);
    expect(btc.places.find((p) => p.where === 'Nexo')?.tag).toBe('pledged');
    expect(btc.valueCents).toBe(records);
    expect(btc.quantity).toBeCloseTo(1.42, 8);
  });
});

describe('treemap layout', () => {
  it('gives every value an area in proportion, filling the box without overlap', () => {
    const values = [50, 25, 12, 8, 5];
    const tiles = squarify(values, 400, 200);
    expect(tiles.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
    tiles.forEach((t, i) => expect(t.w * t.h).toBeCloseTo((values[i] / 100) * 400 * 200, 6));
    for (const t of tiles) { expect(t.x + t.w).toBeLessThanOrEqual(400 + 1e-6); expect(t.y + t.h).toBeLessThanOrEqual(200 + 1e-6); }
    for (const a of tiles) for (const b of tiles) if (a !== b) {
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6;
      expect(overlap).toBe(false);
    }
  });

  it('draws nothing for an empty or zero box', () => {
    expect(squarify([], 100, 100)).toEqual([]);
    expect(squarify([1, 2], 0, 100)).toEqual([]);
  });
});
