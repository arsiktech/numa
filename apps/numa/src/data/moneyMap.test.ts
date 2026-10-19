import type { CloudSnapshot, CloudWallet } from '@/cloud/api';
import type { Item } from './items';
import { historyOf, moneyMap, partyKey, partyOf, type DebtEvent } from './moneyMap';

const fx = { usdPerEur: 1.25, asOf: '2026-10-19' };
const fresh = { text: 'Live', tone: 'live' as const };
const item = (over: Partial<Item> & Pick<Item, 'id' | 'type' | 'group' | 'name' | 'valueCents' | 'raw'>): Item => ({ detail: null, changeTodayCents: null, freshness: fresh, ...over });

const wallet: CloudWallet = {
  id: 'w1', label: 'Frame', address: '0x0000000000000000000000000000000000000001', addressType: 'evm', includeInNetWorth: true, createdAt: 0,
  snapshot: { provider: 'public', totalValueUsd: 6000, debtValueUsd: 4000, chains: ['base'], failedChains: [], updatedAt: 0, partial: false, tokens: [],
    defiPositions: [
      { id: 'base:aave-v3', chainName: 'Base', protocol: 'Aave V3', label: 'Aave V3', assetValueUsd: 10_000, debtValueUsd: 4_000, healthFactor: 2,
        assets: [{ symbol: 'cbBTC', quantity: '0.1', valueUsd: 10_000 }, { symbol: 'USDC', quantity: '4000', valueUsd: 4_000, debt: true }] },
    ] },
};
const lent = { id: 'a1', name: 'Loan to the company', kind: 'other', balance: 50_000, currency: 'EUR', owedBy: 'XCHAINGER', updatedAt: 0 } as const;
const deposit = { id: 'a2', name: 'Rental deposit', kind: 'other', balance: 2_400, currency: 'EUR', owedBy: 'Landlord', updatedAt: 0 } as const;
const car = { id: 'a3', name: 'Tesla', kind: 'vehicle', balance: 29_000, currency: 'EUR', updatedAt: 0 } as const;
const stasEur = { id: 'l1', name: 'Stas (EUR)', kind: 'other', balance: 19_670, currency: 'EUR', dueDate: null, counterparty: 'Stas', updatedAt: 0 } as const;
const stasUsdc = { id: 'l2', name: 'Stas (USDC)', kind: 'other', balance: 26_800, currency: 'USD', dueDate: null, owedSymbol: 'USDC', owedQuantity: 26_800, counterparty: ' stas ', updatedAt: 0 } as const;
const card = { id: 'l3', name: 'Card', kind: 'credit_card', balance: 400, currency: 'EUR', dueDate: null, updatedAt: 0 } as const;

const snapshot = { assets: [lent, deposit, car], liabilities: [stasEur, stasUsdc, card], wallets: [wallet] } as unknown as CloudSnapshot;
const items: Item[] = [
  item({ id: 'a1', type: 'asset', group: 'things', name: lent.name, valueCents: 5_000_000, raw: lent as never }),
  item({ id: 'a2', type: 'asset', group: 'things', name: deposit.name, valueCents: 240_000, raw: deposit as never }),
  item({ id: 'a3', type: 'asset', group: 'things', name: car.name, valueCents: 2_900_000, raw: car as never }),
  item({ id: 'w1', type: 'wallet', group: 'crypto', name: 'Frame', valueCents: 800_000, raw: wallet as never }),
  item({ id: 'w1:loan', type: 'wallet', group: 'debts', name: 'Frame loan', valueCents: 320_000, raw: wallet as never }),
  item({ id: 'l1', type: 'liability', group: 'debts', name: stasEur.name, valueCents: 1_967_000, raw: stasEur as never }),
  item({ id: 'l2', type: 'liability', group: 'debts', name: stasUsdc.name, valueCents: 2_144_000, raw: stasUsdc as never }),
  item({ id: 'l3', type: 'liability', group: 'debts', name: card.name, valueCents: 40_000, raw: card as never }),
];

describe('money map', () => {
  const map = moneyMap(snapshot, items, 'EUR', fx);

  it('groups debts by who they are with, so Stas is one row however many records', () => {
    expect(map.people.map((p) => [p.name, p.cents, p.detail])).toEqual([['Stas', 4_111_000, '2 debts · EUR, USDC'], ['Card', 40_000, '€400']]);
    expect(partyOf(map, partyKey('byYou', 'STAS'))?.records.map((r) => r.amount)).toEqual(['€19,670', '26,800 USDC']);
  });

  it('shows money lent out as owed to you, apart from what you own', () => {
    expect(map.owedToYou.map((p) => [p.name, p.cents])).toEqual([['XCHAINGER', 5_000_000], ['Landlord', 240_000]]);
    expect(map.spots.map((s) => s.name)).toEqual(['Things', 'Frame']);
    expect(map.spots[0]).toMatchObject({ cents: 2_900_000, detail: 'Tesla' });
  });

  it('lists wallet borrowing by protocol, with its health, and marks the wallet as pledged', () => {
    expect(map.protocols).toEqual([expect.objectContaining({ name: 'Aave V3', cents: 320_000, detail: 'Base · health 2.00' })]);
    expect(map.protocols[0].records[0]).toMatchObject({ amount: '4,000 USDC', unit: null, open: { pathname: '/loan/[key]', params: { key: 'defi:w1:base:aave-v3' } } });
    expect(map.spots.find((s) => s.name === 'Frame')).toMatchObject({ pledged: true, cents: 800_000 });
  });

  it('adds up to net worth: yours plus owed to you minus what you owe', () => {
    expect(map).toMatchObject({ ownCents: 3_700_000, owedToYouCents: 5_240_000, youOweCents: 4_471_000, netCents: 4_469_000, unknown: 0 });
    const counted = items.reduce((t, i) => t + (i.group === 'debts' ? -1 : 1) * (i.valueCents ?? 0), 0);
    expect(map.netCents).toBe(counted);
  });

  it('keeps a debt without a value visible and out of the sums, never as zero', () => {
    const m = moneyMap(snapshot, items.map((i) => (i.id === 'l2' ? { ...i, valueCents: null } : i)), 'EUR', fx);
    expect(m.people[0]).toMatchObject({ name: 'Stas', cents: 1_967_000, unknown: 1 });
    expect(m.unknown).toBe(1);
  });

  it('gives a party its history, oldest first, and nothing from other parties', () => {
    const e = (id: string, subject: string, at: number): DebtEvent => ({ id, subject, kind: 'repaid', amount: 1, unit: 'EUR', applied: true, occurredAt: at, note: null });
    const stas = partyOf(map, partyKey('byYou', 'Stas'))!;
    expect(historyOf(stas, [e('b', 'liability:l2', 2), e('a', 'liability:l1', 1), e('x', 'liability:l3', 0)]).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
