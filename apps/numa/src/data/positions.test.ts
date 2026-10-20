import type { CloudWallet } from '@/cloud/api';
import { squarify } from '@/ui/treemapLayout';
import { demoHoldings } from './demo';
import type { Item } from './items';
import { debtAssetsOf, familiesOf, positionsOf, spotsOf, walletPieces } from './positions';
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

  it('shows each liquidity pool as its own position, named by its pair', () => {
    const pools: CloudWallet = { ...wallet, snapshot: { ...wallet.snapshot!, tokens: [], defiPositions: [
      { id: 'base:uniswap-v3:1', chainName: 'Base', protocol: 'Uniswap V3', label: 'WETH / USDC 0.05% pool', kind: 'liquidity', symbols: ['WETH', 'USDC'], assetValueUsd: 500, debtValueUsd: 0 },
      { id: 'base:compound-v3:0xb1', chainName: 'Base', protocol: 'Compound V3', label: 'Compound V3 lending', kind: 'supplied', symbols: ['USDC'], assetValueUsd: 250, debtValueUsd: 0 },
    ] } };
    expect(walletPieces(pools, 'EUR', fx).map((p) => [p.key, p.name, p.valueCents, p.tag])).toEqual([
      ['pool:Uniswap V3:WETH / USDC', 'WETH / USDC pool', 40_000, 'pool'],
      ['lent:Compound V3', 'Lent on Compound V3', 20_000, 'lent'],
    ]);
  });

  it('splits lending into the coins it holds, sized to the position total, and sees them by place too', () => {
    const lent: CloudWallet = { ...wallet, snapshot: { ...wallet.snapshot!, tokens: [{ id: 'arb:usdc', chainName: 'Arbitrum', symbol: 'USDC', name: 'USDC', quantity: '125', valueUsd: 125 }], defiPositions: [
      { id: 'arbitrum:compound-v3:0x9c', chainName: 'Arbitrum', protocol: 'Compound V3', label: 'Compound V3 lending and borrowing', kind: 'supplied', assetValueUsd: 1000, debtValueUsd: 400,
        assets: [{ symbol: 'WBTC', quantity: '0.01', valueUsd: 700 }, { symbol: 'WETH', quantity: '0.1', valueUsd: 290 }, { symbol: 'USDC', quantity: '400', valueUsd: 400, debt: true }] },
      { id: 'scroll:etherfi-cash', chainName: 'Scroll', protocol: 'ether.fi Cash', label: 'ether.fi Cash loan', kind: 'supplied', assetValueUsd: 0, debtValueUsd: 50, assets: [{ symbol: 'USDC', valueUsd: 50, debt: true }] },
    ] } };
    const pieces = walletPieces(lent, 'EUR', fx);
    // 700 and 290 of a 990 split, scaled to the 1,000 the protocol reports; the loan stays under debts.
    expect(pieces.map((p) => [p.key, p.name, p.quantity, p.valueCents, p.tag, p.where])).toEqual([
      ['USDC', 'USD Coin', 125, 10_000, undefined, undefined],
      ['WBTC', 'Wrapped Bitcoin', 0.01, 56_566, 'pledged', 'Ledger · Compound V3'],
      ['WETH', 'Wrapped Ether', 0.1, 23_434, 'pledged', 'Ledger · Compound V3'],
    ]);
    const items: Item[] = [{ id: 'w1', type: 'wallet', group: 'crypto', name: 'Ledger', detail: null, valueCents: 0, changeTodayCents: null, freshness: fresh, raw: lent, pieces }];
    expect(positionsOf(items, 'crypto').map((p) => p.key)).toEqual(['WBTC', 'WETH', 'USDC']);
    expect(spotsOf(items, 'crypto').map((s) => [s.name, s.assets, s.valueCents, s.items.length])).toEqual([
      ['Ledger · Compound V3', ['WBTC', 'WETH'], 80_000, 1],
      ['Ledger · Wallet', ['USDC'], 10_000, 1],
    ]);
  });

  it('names the place a person saved for a record, instead of "Your record"', () => {
    const kept = holding('h2', 'BTC', 'Bitcoin', 0.2, 1_000_000);
    (kept.raw as { location?: string }).location = 'Trade Republic';
    const [btc] = positionsOf([holding('h1', 'BTC', 'Bitcoin', 1, 9_000_000), kept], 'crypto');
    expect(btc.places.map((p) => p.where)).toEqual(['Your record', 'Trade Republic']);
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

  it('groups versions of one asset by what they really are, and leaves a lone version as itself', () => {
    const items: Item[] = [
      holding('h1', 'CBBTC', 'Coinbase Bitcoin', 1.4, 10_000_000), holding('h2', 'WBTC', 'Wrapped Bitcoin', 0.6, 4_400_000), holding('h3', 'TBTC', 'tBTC', 0.2, 1_400_000),
      holding('h4', 'WSTETH', 'Lido staked Ether', 10, 2_800_000), holding('h5', 'WETH', 'Wrapped Ether', 8, 1_700_000),
      holding('h6', 'WEEUR', 'weEUR', 23_000, 2_360_000), holding('h7', 'LINK', 'Chainlink', 100, 100_000),
    ];
    const families = familiesOf(positionsOf(items, 'crypto'));
    expect(families.map((f) => [f.key, f.name, f.valueCents, f.members.map((m) => m.unit)])).toEqual([
      ['fam:BTC', 'Bitcoin', 15_800_000, ['CBBTC', 'WBTC', 'TBTC']],
      ['fam:ETH', 'Ether', 4_500_000, ['WSTETH', 'WETH']],
      ['WEEUR', 'weEUR', 2_360_000, ['WEEUR']],
      ['LINK', 'Chainlink', 100_000, ['LINK']],
    ]);
    // Wrapped bitcoin is worth one bitcoin, so amounts add up; staked ether isn't, so they don't.
    expect(families[0]).toMatchObject({ unit: 'BTC', quantity: 2.2 });
    expect(families[1].quantity).toBeNull();
  });

  it('shows what you owe by what it is owed in: wallet loans by coin, records by coin or currency', () => {
    const borrowed: CloudWallet = { ...wallet, label: 'Frame', snapshot: { ...wallet.snapshot!, tokens: [], defiPositions: [
      { id: 'base:compound', chainName: 'Base', protocol: 'Compound V3', label: 'Compound V3', assetValueUsd: 900, debtValueUsd: 300,
        assets: [{ symbol: 'WETH', valueUsd: 900 }, { symbol: 'USDC', quantity: '300', valueUsd: 300, debt: true }] },
      { id: 'eth:aave', chainName: 'Ethereum', protocol: 'Aave V3', label: 'Aave V3', assetValueUsd: 500, debtValueUsd: 100,
        assets: [{ symbol: 'USDC', quantity: '60', valueUsd: 60, debt: true }, { symbol: 'GHO', quantity: '40', valueUsd: 40, debt: true }] },
    ] } };
    const debt = (id: string, name: string, cents: number, extra: object): Item => ({ id, type: 'liability', group: 'debts', name, detail: null, valueCents: cents, changeTodayCents: null, freshness: fresh, raw: { id, name, kind: 'other', currency: 'EUR', balance: cents / 100, ...extra } as never });
    const items: Item[] = [
      { id: 'w1', type: 'wallet', group: 'debts', name: 'Frame loans', detail: null, valueCents: 40_000, changeTodayCents: null, freshness: fresh, raw: borrowed },
      debt('l1', 'Company shortfall', 50_000, {}),
      debt('l2', 'Card', 5_000, {}),
      debt('l3', 'Parents', 20_000, { owedSymbol: 'BTC', owedQuantity: 0.003 }),
      debt('l4', 'US loan', 10_000, { currency: 'USD' }),
    ];
    const owed = debtAssetsOf(items);
    // The wallet's 400 is shared by what each loan is worth: 300 + 60 USDC, 40 GHO.
    expect(owed.map((p) => [p.key, p.valueCents])).toEqual([['cur:EUR', 55_000], ['USDC', 36_000], ['BTC', 20_000], ['cur:USD', 10_000], ['GHO', 4_000]]);
    expect(owed.find((p) => p.key === 'USDC')!.places.map((p) => [p.where, p.quantity])).toEqual([['Frame · Compound V3', 300], ['Frame · Aave V3', 60]]);
    expect(owed.find((p) => p.key === 'cur:EUR')!.places.map((p) => p.where)).toEqual(['Company shortfall', 'Card']);
    const families = familiesOf(owed);
    expect(families.map((f) => [f.key, f.name, f.valueCents, f.members.map((m) => m.key)])).toEqual([
      ['cur:EUR', 'Euro', 55_000, ['cur:EUR']],
      ['fam:USD', 'US dollar', 50_000, ['USDC', 'cur:USD', 'GHO']],
      ['BTC', 'Bitcoin', 20_000, ['BTC']],
    ]);
    // Every cent owed is in exactly one block.
    expect(families.reduce((t, f) => t + (f.valueCents ?? 0), 0)).toBe(125_000);
  });

  it('keeps a debt without a value unknown when seen by asset', () => {
    const items: Item[] = [{ id: 'l1', type: 'liability', group: 'debts', name: 'Loan', detail: null, valueCents: null, changeTodayCents: null, freshness: fresh, raw: { id: 'l1', currency: 'EUR', balance: 0 } as never }];
    expect(debtAssetsOf(items)).toMatchObject([{ key: 'cur:EUR', unknown: 1, places: [{ valueCents: null }] }]);
  });
});
