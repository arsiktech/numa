import type { CloudSnapshot, CloudWallet } from '@/cloud/api';
import type { Item } from './items';
import { coinFamily, loanPlaces, loansOf, partChoices, partValue, takenBy, type CloudLoanLink } from './loans';

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
    expect(takenBy(links).get('defi:w1:optimism:etherfi-cash')).toEqual([{ loanKey: 'defi:w1:base:aave-v3', whole: true }]);
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

  it('values only part of a place: the coin’s own price times the amount, wrapped coins counting as the coin', () => {
    const coins = [{ symbol: 'WBTC', quantity: 0.5, valueCents: 4_000_000 }, { symbol: 'cbBTC', quantity: 0.25, valueCents: 2_000_000 }, { symbol: 'WETH', quantity: 2, valueCents: 500_000 }];
    expect(coinFamily('cbBTC')).toBe('BTC');
    expect(partValue(coins, { symbol: 'BTC', quantity: 0.377 })).toBe(3_016_000);
    expect(partValue(coins, { symbol: 'ETH', quantity: 1 })).toBe(250_000);
    expect(partValue(coins, { symbol: 'USDC', quantity: 10 })).toBeNull();
    expect(partValue([{ symbol: 'WBTC', quantity: 0.5, valueCents: null }], { symbol: 'BTC', quantity: 0.1 })).toBeNull();
    expect(partChoices({ key: 'k', name: 'n', detail: null, valueCents: 0, open: null, coins })).toEqual([{ symbol: 'BTC', quantity: 0.75 }, { symbol: 'ETH', quantity: 2 }]);
  });

  it('lets two debts share one position by parts, each valued by its own amount, never the whole place', () => {
    const links: CloudLoanLink[] = [
      { loanKey: 'liability:l1', targets: [{ key: 'defi:w1:base:aave-v3', role: 'deployed', part: { symbol: 'BTC', quantity: 0.05 } }], updatedAt: 0 },
      { loanKey: 'liability:l2', targets: [{ key: 'defi:w1:base:aave-v3', role: 'deployed', part: { symbol: 'BTC', quantity: 0.02 } }], updatedAt: 0 },
    ];
    const l2 = { ...liability, id: 'l2', name: 'Loan from Rae' };
    const loans = loansOf(snapshot(wallet(), [liability, l2] as never), [debt, { ...debt, id: 'l2', name: 'Loan from Rae' }], links, 'EUR', fx, NOW);
    const sam = loans.find((l) => l.key === 'liability:l1')!;
    // 0.1 cbBTC is worth 8,000 euros here, so 0.05 BTC is 4,000; the debt is 4,000: even.
    expect(sam.deployed[0]).toMatchObject({ part: { symbol: 'BTC', quantity: 0.05 }, valueCents: 400_000, wholeCents: 800_000 });
    expect(sam.resultCents).toBe(0);
    expect(loans.find((l) => l.key === 'liability:l2')!.deployedCents).toBe(160_000);
    expect(takenBy(links).get('defi:w1:base:aave-v3')).toEqual([{ loanKey: 'liability:l1', whole: false }, { loanKey: 'liability:l2', whole: false }]);
  });
});
