import type { CloudAsset, CloudCurrency, CloudHolding, CloudLiability } from '@/cloud/api';
import type { Op } from '@/ask/plan';

const major = (cents: number) => Math.round(cents) / 100;
const minor = (amount: number) => Math.round(amount * 100);

export type AssetFields = { name: string; kind: CloudAsset['kind']; balanceCents: number; currency: CloudCurrency; location: string };
export type DebtFields = { name: string; kind: CloudLiability['kind']; balanceCents: number; currency: CloudCurrency; dueDate: number | null };
export type HoldingFields = { symbol: string; name: string; kind: CloudHolding['kind']; quantity: number; costBasisCents: number; currency: CloudCurrency; location: string };
export type Fields = AssetFields | DebtFields | HoldingFields;

export const assetFields = (a: CloudAsset): AssetFields => ({ name: a.name, kind: a.kind, balanceCents: minor(a.balance), currency: a.currency, location: a.location ?? '' });
export const debtFields = (l: CloudLiability): DebtFields => ({ name: l.name, kind: l.kind, balanceCents: minor(l.balance), currency: l.currency, dueDate: l.dueDate });
export const holdingFields = (h: CloudHolding): HoldingFields => ({ symbol: h.symbol, name: h.name, kind: h.kind, quantity: h.quantity, costBasisCents: minor(h.costBasis), currency: h.currency, location: h.location ?? '' });

function args(type: 'asset' | 'liability' | 'holding', f: Fields, portfolioId: string, extra: Record<string, unknown>) {
  if (type === 'asset') { const a = f as AssetFields; return { portfolioId, name: a.name.trim(), kind: a.kind, balance: major(a.balanceCents), currency: a.currency, location: a.location.trim(), ...extra }; }
  if (type === 'liability') { const d = f as DebtFields; return { portfolioId, name: d.name.trim(), kind: d.kind, balance: major(d.balanceCents), currency: d.currency, ...(d.dueDate !== null ? { dueDate: d.dueDate } : {}), ...extra }; }
  const h = f as HoldingFields;
  return { portfolioId, symbol: h.symbol.trim().toUpperCase(), name: h.name.trim() || h.symbol.trim().toUpperCase(), kind: h.kind, quantity: h.quantity, costBasis: major(h.costBasisCents), currency: h.currency, location: h.location.trim(), ...extra };
}
const upsert = { asset: 'upsertAsset', liability: 'upsertLiability', holding: 'upsertHolding' } as const;
const remove = { asset: 'deleteAsset', liability: 'deleteLiability', holding: 'deleteHolding' } as const;

/** Save writes the new fields; Undo writes the old ones back to the same record. */
export function editPlan(type: 'asset' | 'liability' | 'holding', id: string, before: Fields, after: Fields, portfolioId: string, acquiredAt?: number): { apply: Op; undo: Op } {
  const keep = type === 'holding' ? { acquiredAt } : {};
  return {
    apply: { fn: upsert[type], args: args(type, after, portfolioId, { id, ...keep }) },
    undo: { fn: upsert[type], args: args(type, before, portfolioId, { id, ...keep }) },
  };
}

/** Delete removes the record; Undo puts the same fields back as a new record. */
export function deletePlan(type: 'asset' | 'liability' | 'holding', id: string, before: Fields, portfolioId: string, acquiredAt?: number): { apply: Op; undo: Op } {
  return {
    apply: { fn: remove[type], args: { id } },
    undo: { fn: upsert[type], args: args(type, before, portfolioId, type === 'holding' ? { acquiredAt } : {}) },
  };
}

/** What still stops an edit from being saved, in plain words. */
export function fieldProblems(type: 'asset' | 'liability' | 'holding', f: Fields): string[] {
  const out: string[] = [];
  if (type === 'holding') {
    const h = f as HoldingFields;
    if (!/^[A-Z0-9.\-]{1,12}$/i.test(h.symbol.trim())) out.push('Add the ticker, like VOO or BTC.');
    if (!(h.quantity > 0)) out.push('Add how many you have.');
    if (!(h.costBasisCents > 0)) out.push('Add what you paid in total.');
    if (h.location.trim().length > 60) out.push('Keep where it is to 60 characters.');
    return out;
  }
  const a = f as AssetFields | DebtFields;
  if (!a.name.trim()) out.push('Add a name.');
  if (!(a.balanceCents >= 0)) out.push('Add an amount.');
  if ('location' in a && a.location.trim().length > 60) out.push('Keep where it is to 60 characters.');
  return out;
}
