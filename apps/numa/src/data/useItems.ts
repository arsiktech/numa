import { useMemo } from 'react';

import type { CloudAsset, CloudLiability } from '@/cloud/api';
import { freshness, shortDay } from '@/domain/freshness';
import { countedValue } from '@/domain/summary';
import type { Currency } from '@/domain/types';
import { useCloudData } from './cloud';
import { demoDebts, demoHoldings, demoNow, demoPlaces } from './demo';
import { itemsFrom, type Item } from './items';

export type ItemsSource =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; demo: boolean; items: Item[]; currency: Currency; portfolioId: string | null; now: number };

/** The labelled demo portfolio as read-only rows. */
function demoItems(): Item[] {
  const now = demoNow.getTime();
  const rows: Item[] = demoHoldings.map((h) => ({
    id: h.id, type: 'asset', group: h.category, name: h.name, detail: h.quantity ? `${h.quantity.amount} ${h.quantity.unit}` : null,
    valueCents: countedValue(h.valuation)?.cents ?? null, changeTodayCents: h.changeTodayCents ?? null, freshness: freshness(h.valuation, now),
    raw: { id: h.id, name: h.name, kind: 'other', balance: 0, currency: 'EUR', updatedAt: now } as CloudAsset,
    pieces: demoPlaces(h),
  }));
  for (const d of demoDebts) {
    rows.push({ id: d.id, type: 'liability', group: 'debts', name: d.name, detail: 'Debt', valueCents: d.balanceCents, changeTodayCents: null, freshness: { text: `Your value · ${shortDay(now, now)}`, tone: 'ok' }, raw: { id: d.id, name: d.name, kind: 'other', balance: d.balanceCents / 100, currency: 'EUR', dueDate: null, updatedAt: now } as CloudLiability });
  }
  return rows.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1));
}

export function useCloudItems(): ItemsSource {
  const data = useCloudData();
  const items = useMemo(() => (data.status === 'ready' ? itemsFrom(data.snapshot, data.data, data.now, data.fx) : null), [data]);
  if (data.status === 'error') return { status: 'error', message: data.message };
  if (data.status !== 'ready' || !items) return { status: 'loading' };
  return { status: 'ready', demo: false, items, currency: data.data.currency, portfolioId: data.portfolioId, now: data.now };
}

const demo: ItemsSource = { status: 'ready', demo: true, items: demoItems(), currency: 'EUR', portfolioId: null, now: demoNow.getTime() };
export function useDemoItems(): ItemsSource { return demo; }


