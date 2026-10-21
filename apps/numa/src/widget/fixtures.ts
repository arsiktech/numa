// Synthetic data only. No real account, wallet, counterparty, or personal amount is used here.
import type { CloudSnapshot, CloudTransaction } from '@/cloud/api';
import { fromSnapshot } from '@/data/fromSnapshot';
import type { FxRate } from '@/data/fx';
import { summarize } from '@/domain/summary';
import type { WidgetInput } from './payload';

export const sampleNow = new Date(2026, 9, 21, 12).getTime();
export const sampleFx: FxRate = { usdPerEur: 1.25, asOf: '2026-10-21' };
export const localDay = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();

export function sampleTransaction(id: string, day: number, cents: number, extra: Partial<CloudTransaction> = {}): CloudTransaction {
  return {
    id, occurredAt: localDay(day), description: 'Example purchase', kind: 'expense', amountMinor: -cents,
    currency: 'EUR', categoryId: null, accountId: null, notes: null, ...extra,
  };
}

export function sampleSnapshot(): CloudSnapshot {
  return {
    portfolio: { id: 'example-space-a', name: 'Example', defaultCurrency: 'EUR' },
    categories: [],
    assets: [
      { id: 'example-cash', name: 'Example cash', kind: 'cash', balance: 200, currency: 'EUR', updatedAt: sampleNow },
      { id: 'example-lent', name: 'Example lending', kind: 'other', balance: 80, currency: 'EUR', owedBy: 'Example party', updatedAt: sampleNow },
      { id: 'example-property', name: 'Example property', kind: 'real_estate', balance: 120, currency: 'EUR', updatedAt: sampleNow },
      { id: 'example-business', name: 'Example business', kind: 'business', balance: 60, currency: 'EUR', updatedAt: sampleNow },
      { id: 'example-things', name: 'Example item', kind: 'vehicle', balance: 40, currency: 'EUR', updatedAt: sampleNow },
    ],
    liabilities: [{ id: 'example-debt', name: 'Example debt', kind: 'loan', balance: 900, currency: 'EUR', dueDate: null, updatedAt: sampleNow }],
    holdings: [
      { id: 'example-crypto', symbol: 'EXAMPLE', name: 'Example crypto', kind: 'crypto', quantity: 2, costBasis: 30, currency: 'EUR', acquiredAt: localDay(1), marketPrice: 25, changePercent: 10, quoteProvider: 'coingecko', quoteUpdatedAt: sampleNow - 60_000, quoteStale: false },
      { id: 'example-stock', symbol: 'SAMPLE', name: 'Example stock', kind: 'stock', quantity: 1, costBasis: 70, currency: 'EUR', acquiredAt: localDay(1), marketPrice: 125, changePercent: 5, quoteProvider: 'stooq', quoteUpdatedAt: sampleNow - 120_000, quoteStale: false },
    ],
    wealthSnapshots: [
      { takenAt: localDay(1), netWorth: 100, currency: 'EUR' },
      { takenAt: localDay(5), netWorth: 110, currency: 'EUR' },
      { takenAt: localDay(20), netWorth: 105, currency: 'EUR' },
    ],
    transactions: [
      sampleTransaction('example-t1', 3, 1200), sampleTransaction('example-t2', 3, 2500, { currency: 'USD' }),
      sampleTransaction('example-t3', 12, 400), sampleTransaction('example-income', 15, 50_000, { kind: 'income' }),
      sampleTransaction('example-future', 29, 99_999),
    ],
    wallets: [],
  };
}

export function sampleInput(snapshot = sampleSnapshot(), fx: FxRate | null = sampleFx, now = sampleNow): WidgetInput {
  const data = fromSnapshot(snapshot, fx, new Date(now));
  return { snapshot, data, fx, now, syncedAt: sampleNow, hidden: false, summary: summarize(data.holdings, data.debts, new Date(now)) };
}
