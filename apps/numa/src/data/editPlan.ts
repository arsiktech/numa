import type { CloudAsset, CloudCurrency, CloudHolding, CloudLiability } from '@/cloud/api';
import type { Op } from '@/ask/plan';

const major = (cents: number) => Math.round(cents) / 100;
const minor = (amount: number) => Math.round(amount * 100);

/** `costCents` and `acquiredAt` are what it cost and when it was bought; null when not known. */
export type AssetFields = { name: string; kind: CloudAsset['kind']; balanceCents: number; currency: CloudCurrency; location: string; costCents: number | null; acquiredAt: number | null };
export type DebtFields = { name: string; kind: CloudLiability['kind']; balanceCents: number; currency: CloudCurrency; dueDate: number | null };
export type HoldingFields = { symbol: string; name: string; kind: CloudHolding['kind']; quantity: number; costBasisCents: number; currency: CloudCurrency; location: string };
export type Fields = AssetFields | DebtFields | HoldingFields;

export const assetFields = (a: CloudAsset): AssetFields => ({ name: a.name, kind: a.kind, balanceCents: minor(a.balance), currency: a.currency, location: a.location ?? '', costCents: a.costBasis ? minor(a.costBasis) : null, acquiredAt: a.acquiredAt ?? null });
export const debtFields = (l: CloudLiability): DebtFields => ({ name: l.name, kind: l.kind, balanceCents: minor(l.balance), currency: l.currency, dueDate: l.dueDate });
export const holdingFields = (h: CloudHolding): HoldingFields => ({ symbol: h.symbol, name: h.name, kind: h.kind, quantity: h.quantity, costBasisCents: minor(h.costBasis), currency: h.currency, location: h.location ?? '' });

function args(type: 'asset' | 'liability' | 'holding', f: Fields, portfolioId: string, extra: Record<string, unknown>) {
  if (type === 'asset') { const a = f as AssetFields; return { portfolioId, name: a.name.trim(), kind: a.kind, balance: major(a.balanceCents), currency: a.currency, location: a.location.trim(), costBasis: a.costCents ? major(a.costCents) : null, acquiredAt: a.acquiredAt, ...extra }; }
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
  if ('costCents' in a && a.costCents !== null && !(a.costCents > 0)) out.push('What it cost must be more than zero, or empty.');
  return out;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * When something was bought, typed loosely: "2025-02-14", "2025-02", "Feb 2025", "14 Feb 2025".
 * A month without a day means the 1st. Null when it can't be read or is in the future.
 */
export function parseBought(text: string, now: number): number | null {
  const t = text.trim().toLowerCase();
  let y: number | null = null, mo: number | null = null, d = 1;
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(t);
  if (m) { y = Number(m[1]); mo = Number(m[2]) - 1; d = m[3] ? Number(m[3]) : 1; }
  else {
    m = /^(?:(\d{1,2})\s+)?([a-z]{3})[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/.exec(t);
    if (m && MONTH_NAMES.includes(m[2])) { y = Number(m[4]); mo = MONTH_NAMES.indexOf(m[2]); d = Number(m[1] ?? m[3] ?? 1); }
  }
  if (y === null || mo === null || mo < 0 || mo > 11 || d < 1 || d > 31 || y < 1900) return null;
  const at = Date.UTC(y, mo, d, 12);
  if (new Date(at).getUTCMonth() !== mo || at > now + 86_400_000) return null;
  return at;
}

/** "Feb 2025". */
export const monthYear = (at: number) => new Date(at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
