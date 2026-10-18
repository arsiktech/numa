import type { CloudAsset, CloudHolding, CloudLiability, CloudSnapshot, CloudWallet } from '@/cloud/api';
import { freshness, shortDay, type Freshness } from '@/domain/freshness';
import { countedValue } from '@/domain/summary';
import type { CategoryId, Holding } from '@/domain/types';
import type { HomeData } from './fromSnapshot';
import type { FxRate } from './fx';
import { walletPieces, type Piece } from './positions';
import { walletDetail, walletLoanId } from './wallets';

export type GroupId = CategoryId | 'debts';
export type ItemType = 'asset' | 'holding' | 'liability' | 'wallet';

/** One row on Holdings: a record the person can open, edit or delete. */
export type Item = {
  id: string;
  type: ItemType;
  group: GroupId;
  name: string;
  /** "0.5 BTC", "Credit card". */
  detail: string | null;
  /** In the portfolio currency, or null when it cannot be valued. */
  valueCents: number | null;
  changeTodayCents: number | null;
  freshness: Freshness;
  raw: CloudAsset | CloudHolding | CloudLiability | CloudWallet;
  /** What the record holds, when it holds several things (a wallet's tokens and lending). */
  pieces?: Piece[];
};

export const groupNames: Record<GroupId, string> = { crypto: 'Crypto', stocks: 'Stocks and funds', business: 'Business', property: 'Property', cash: 'Cash', things: 'Things', debts: 'What you owe' };
const assetKindNames: Record<CloudAsset['kind'], string> = { cash: 'Cash account', real_estate: 'Property', vehicle: 'Vehicle', collectible: 'Collectible', other: 'Other' };
const debtKindNames: Record<CloudLiability['kind'], string> = { credit_card: 'Credit card', loan: 'Loan', mortgage: 'Mortgage', other: 'Debt' };
const DAY = 86_400_000;
const NEEDS_RATE: Freshness = { text: 'Needs today’s exchange rate', tone: 'missing' };

function fromDomain(h: Holding | undefined, now: number) {
  if (!h) return { valueCents: null, changeTodayCents: null, freshness: NEEDS_RATE, group: null };
  return { valueCents: countedValue(h.valuation)?.cents ?? null, changeTodayCents: h.changeTodayCents ?? null, freshness: freshness(h.valuation, now), group: h.category };
}

/** Every record, grouped the way Home's blocks are, with values in the portfolio currency. */
export function itemsFrom(s: CloudSnapshot, data: HomeData, now: number, fx: FxRate | null = null): Item[] {
  const byId = new Map(data.holdings.map((h) => [h.id, h]));
  const debtById = new Map(data.debts.map((d) => [d.id, d]));
  const items: Item[] = [];
  for (const a of s.assets) {
    const debt = debtById.get(a.id);
    if (debt) {
      items.push({ id: a.id, type: 'asset', group: 'debts', name: a.name, detail: 'Overdrawn account', valueCents: debt.balanceCents, changeTodayCents: null, freshness: { text: `Your value · ${shortDay(a.updatedAt, now)}`, tone: 'ok' }, raw: a });
      continue;
    }
    const d = fromDomain(byId.get(a.id), now);
    items.push({ id: a.id, type: 'asset', group: d.group ?? (a.kind === 'cash' ? 'cash' : a.kind === 'real_estate' ? 'property' : 'things'), name: a.name, detail: assetKindNames[a.kind], valueCents: d.valueCents, changeTodayCents: null, freshness: d.freshness, raw: a });
  }
  for (const h of s.holdings) {
    const d = fromDomain(byId.get(h.id), now);
    items.push({ id: h.id, type: 'holding', group: d.group ?? (h.kind === 'crypto' ? 'crypto' : 'stocks'), name: h.name || h.symbol, detail: `${h.quantity} ${h.symbol}`, valueCents: d.valueCents, changeTodayCents: d.changeTodayCents, freshness: d.freshness, raw: h });
  }
  for (const w of s.wallets ?? []) {
    const d = fromDomain(byId.get(w.id), now);
    const freshness = !w.includeInNetWorth ? { text: 'Not counted in net worth', tone: 'ok' as const } : !w.snapshot ? { text: 'Checking the balance…', tone: 'missing' as const } : d.freshness;
    items.push({ id: w.id, type: 'wallet', group: 'crypto', name: w.label, detail: walletDetail(w), valueCents: w.includeInNetWorth ? d.valueCents : null, changeTodayCents: null, freshness, raw: w, pieces: w.includeInNetWorth && w.snapshot ? walletPieces(w, data.currency, fx) : undefined });
    const loan = debtById.get(walletLoanId(w.id));
    if (loan) items.push({ id: loan.id, type: 'wallet', group: 'debts', name: loan.name, detail: 'Borrowed in DeFi', valueCents: loan.balanceCents, changeTodayCents: null, freshness, raw: w });
  }
  for (const l of s.liabilities) {
    const debt = debtById.get(l.id);
    const due = l.dueDate;
    const soon = due !== null && due >= now - DAY && due - now <= 14 * DAY;
    items.push({
      id: l.id, type: 'liability', group: 'debts', name: l.name, detail: l.owedSymbol ? `${l.owedQuantity} ${l.owedSymbol}` : debtKindNames[l.kind], valueCents: debt?.balanceCents ?? null, changeTodayCents: null,
      freshness: !debt ? NEEDS_RATE : due !== null ? { text: `Due ${shortDay(due, now)}`, tone: soon ? 'due' : 'ok' } : { text: 'No due date', tone: 'ok' },
      raw: l,
    });
  }
  // Biggest first; unknown values last so they are seen, not hidden among the small ones.
  return items.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1));
}

export function groupTotal(items: Item[]): { cents: number; unknown: number } {
  return items.reduce((t, i) => (i.valueCents === null ? { ...t, unknown: t.unknown + 1 } : { ...t, cents: t.cents + i.valueCents }), { cents: 0, unknown: 0 });
}
