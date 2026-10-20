import type { CloudSnapshot, CloudWallet } from '@/cloud/api';
import type { Item } from './items';
import { loanPlaces, loansOf, safetyOf, takenBy, type CloudLoanLink } from './loans';

const NOW = Date.UTC(2026, 9, 19, 12);
const fx = { usdPerEur: 1.25, asOf: '2026-10-19' };
const fresh = { text: 'Live', tone: 'live' as const };

const wallet = (updatedAt = NOW - 60_000): CloudWallet => ({
  id: 'w1', label: 'Frame', address: '0x0000000000000000000000000000000000000001', addressType: 'evm', includeInNetWorth: true, createdAt: 0,
  snapshot: { provider: 'public', totalValueUsd: 0, chains: ['base'], failedChains: [], updatedAt, partial: false,
    tokens: [{ id: 'base:usdc', chainName: 'Base', symbol: 'USDC', name: 'USD Coin', quantity: '250', valueUsd: 250 }],
    defiPositions: [
      // 10,000 dollars of cbBTC backs 4,000 USDC owed; Aave says it sells at health factor 1.
      { id: 'base:aave-v3', chainName: 'Base', protocol: 'Aave V3', label: 'Aave V3', assetValueUsd: 10_000, debtValueUsd: 4_000, healthFactor: 2,
        assets: [{ symbol: 'cbBTC', quantity: '0.1', valueUsd: 10_000 }, { symbol: 'USDC', quantity: '4000', valueUsd: 4_000, debt: true }] },
      { id: 'optimism:etherfi-cash', chainName: 'Optimism', protocol: 'ether.fi Cash', label: 'ether.fi Cash', assetValueUsd: 5_000, debtValueUsd: 0,
        assets: [{ symbol: 'liquidUSD', quantity: '4900', valueUsd: 5_000 }] },
    ] },
});
const snapshot = (w: CloudWallet, liabilities: CloudSnapshot['liabilities'] = []) => ({ wallets: [w], liabilities } as unknown as CloudSnapshot);
const holding: Item = { id: 'h1', type: 'holding', group: 'crypto', name: 'Bitcoin', detail: '0.1 BTC', valueCents: 800_000, changeTodayCents: null, freshness: fresh, raw: {} as never };
const debt: Item = { id: 'l1', type: 'liability', group: 'debts', name: 'Loan from Sam', detail: '5000 USDT', valueCents: 400_000, changeTodayCents: null, freshness: fresh, raw: {} as never };
const liability = { id: 'l1', name: 'Loan from Sam', kind: 'loan', balance: 4000, currency: 'EUR', dueDate: null, owedSymbol: 'USDT', owedQuantity: 5000, updatedAt: 0 } as const;

describe('loans', () => {
  it('reads a wallet borrowing whole: collateral from the protocol, the owed coins, loan to value and the sell point', () => {
    const [loan] = loansOf(snapshot(wallet()), [], [], 'EUR', fx, NOW);
    expect(loan).toMatchObject({
      key: 'defi:w1:base:aave-v3', kind: 'wallet', name: 'Aave V3 · Base', where: 'Frame', owed: [{ symbol: 'USDC', quantity: 4000 }],
      debtCents: 320_000, collateralCents: 800_000, deployedCents: null, resultCents: null, netCents: 480_000, linked: false,
    });
    expect(loan.ltv).toBeCloseTo(0.4);
    expect(loan.liquidationLtv).toBeCloseTo(0.8);
    expect(loan.collateral.map((c) => [c.name, c.detail, c.valueCents])).toEqual([['cbBTC', '0.1 cbBTC', 800_000]]);
  });

  it('adds where the money went to the loan without counting it twice anywhere else', () => {
    const links: CloudLoanLink[] = [{ loanKey: 'defi:w1:base:aave-v3', targets: [{ key: 'defi:w1:optimism:etherfi-cash', role: 'deployed' }], updatedAt: 0 }];
    const [loan] = loansOf(snapshot(wallet()), [], links, 'EUR', fx, NOW);
    // Borrowed 3,200 euros of USDC; it now sits in 4,000 euros of ether.fi: up 800.
    expect(loan).toMatchObject({ deployedCents: 400_000, resultCents: 80_000, netCents: 880_000, gaps: 0, linked: true });
    expect(loan.deployed[0]).toMatchObject({ name: 'ether.fi Cash · Optimism', detail: 'Frame · liquidUSD', open: { type: 'wallet', id: 'w1' } });
    expect(takenBy(links).get('defi:w1:optimism:etherfi-cash')).toBe('defi:w1:base:aave-v3');
  });

  it('keeps a missing place visible and leaves the result unknown instead of counting it as zero', () => {
    const links: CloudLoanLink[] = [{ loanKey: 'defi:w1:base:aave-v3', targets: [{ key: 'defi:w1:base:morpho:gone', role: 'deployed' }, { key: 'token:w1:base:usdc', role: 'deployed' }], updatedAt: 0 }];
    const [loan] = loansOf(snapshot(wallet()), [], links, 'EUR', fx, NOW);
    expect(loan.deployed.map((p) => [p.name, p.valueCents, p.gone ?? false])).toEqual([['A position no longer in the wallet', null, true], ['USDC · Base', 20_000, false]]);
    expect(loan).toMatchObject({ deployedCents: 20_000, gaps: 1, resultCents: null, netCents: null });
  });

  it('shows no loan to value from a stale read, but still the debt', () => {
    const [loan] = loansOf(snapshot(wallet(NOW - 7 * 3_600_000)), [], [], 'EUR', fx, NOW);
    expect(loan).toMatchObject({ debtCents: 320_000, ltv: null, liquidationLtv: null });
  });

  it('takes a recorded debt’s collateral by hand, and its value as the debt record has it', () => {
    const links: CloudLoanLink[] = [{ loanKey: 'liability:l1', targets: [{ key: 'holding:h1', role: 'collateral' }], updatedAt: 0 }];
    const loans = loansOf(snapshot(wallet(), [liability] as never), [holding, debt], links, 'EUR', fx, NOW);
    const sam = loans.find((l) => l.kind === 'debt')!;
    expect(sam).toMatchObject({ name: 'Loan from Sam', owed: [{ symbol: 'USDT', quantity: 5000 }], debtCents: 400_000, collateralCents: 800_000, ltv: 0.5, liquidationLtv: null, checkedAt: null });
    expect(loans.map((l) => l.key)).toEqual(['liability:l1', 'defi:w1:base:aave-v3']);
  });

  it('offers only places that count in net worth: positions with value, tokens, holdings and assets', () => {
    const w = wallet();
    const places = loanPlaces(snapshot(w), [holding, debt], 'EUR', fx);
    expect([...places.keys()]).toEqual(['defi:w1:base:aave-v3', 'defi:w1:optimism:etherfi-cash', 'token:w1:base:usdc', 'holding:h1']);
    expect(loanPlaces(snapshot({ ...w, includeInNetWorth: false }), [], 'EUR', fx).size).toBe(0);
  });

  it('says how far a loan is from liquidation, and the coin price where it is sold', () => {
    const [loan] = loansOf(snapshot(wallet()), [], [], 'EUR', fx, NOW);
    // Health 2: what backs it can halve before it is sold. 0.1 cbBTC is 8,000 euros, so 80,000 a coin, sold at 40,000.
    expect(safetyOf(loan)).toEqual({ health: 2, used: 0.5, cushion: 0.5, zone: 'safe', prices: [{ name: 'Bitcoin', symbol: 'BTC', nowCents: 8_000_000, liquidationCents: 4_000_000, drop: 0.5 }] });
    expect(safetyOf({ ...loan, healthFactor: 1.3 })?.zone).toBe('watch');
    expect(safetyOf({ ...loan, healthFactor: 1.05 })?.zone).toBe('danger');
    expect(safetyOf({ ...loan, healthFactor: 0.9 })).toMatchObject({ used: 1, cushion: 0 });
    // A coin owed against a coin moves both ways: no single price to watch.
    expect(safetyOf({ ...loan, owed: [{ symbol: 'ETH', quantity: 1 }] })?.prices).toEqual([]);
  });

  it('knows nothing about liquidation without a health factor, never that it is safe', () => {
    const links: CloudLoanLink[] = [{ loanKey: 'liability:l1', targets: [{ key: 'holding:h1', role: 'collateral' }], updatedAt: 0 }];
    const loan = loansOf(snapshot(wallet(), [liability] as never), [holding, debt], links, 'EUR', fx, NOW).find((l) => l.kind === 'debt')!;
    expect(safetyOf(loan)).toBeNull();
  });

  it('gives each kind of coin behind a loan its own sell price, as if only it fell', () => {
    const [base] = loansOf(snapshot(wallet()), [], [], 'EUR', fx, NOW);
    const coin = (symbol: string, quantity: number, valueCents: number) => ({ key: symbol, name: symbol, detail: null, valueCents, open: null, coin: { symbol, quantity } });
    // 60,000 of Bitcoin (as WBTC and tBTC), 30,000 of Ether (WETH and wstETH), 10,000 of a dollar vault; health 2.
    const loan = { ...base, healthFactor: 2, owed: [{ symbol: 'USDT0', quantity: 40_000 }],
      collateral: [coin('WBTC', 0.4, 4_000_000), coin('tBTC', 0.2, 2_000_000), coin('WETH', 5, 2_000_000), coin('wstETH', 2, 1_000_000), coin('liquidUSD', 1_000, 1_000_000)] };
    const s = safetyOf(loan)!;
    // Bitcoin alone must lose half of everything (50,000 of 100,000): 50,000 / 60,000 of its value.
    expect(s.prices).toEqual([
      { name: 'Bitcoin', symbol: 'BTC', nowCents: 10_000_000, drop: 5 / 6, liquidationCents: Math.round(10_000_000 / 6) },
      // Ether is only 30,000: even at zero it can't take away 50,000, so on its own it can't trigger a sale.
      { name: 'Ether', symbol: 'ETH', nowCents: 400_000, drop: null, liquidationCents: null },
    ]);
  });
});

