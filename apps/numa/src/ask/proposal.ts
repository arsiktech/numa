import type { AskProposal } from '@/cloud/api';
import type { AskContext, Draft } from './parse';
import { sameName } from './parse';

const toCents = (major: number | null) => (major === null ? 0 : Math.round(major * 100));
const noon = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

/**
 * Turns one entry Claude proposed into the same draft the on-device parser makes, matched to
 * what the person already has. A missing amount stays at zero cents only as an empty field:
 * `draftProblems` then asks for it, so nothing unknown is saved as zero.
 */
export function proposalToDraft(p: AskProposal, ctx: AskContext): Draft | null {
  const today = ctx.now.getTime();
  if (p.kind === 'expense' || p.kind === 'income') {
    const category = p.category ? ctx.categories.find((c) => c.kind === p.kind && c.name.toLowerCase() === p.category!.toLowerCase()) ?? null : null;
    return {
      type: 'transaction', kind: p.kind, description: p.name, amountCents: toCents(p.amount), currency: p.currency ?? ctx.currency,
      occurredAt: p.date ? Math.min(noon(p.date), today) : today, categoryId: category?.id ?? null, categoryName: category?.name ?? null,
    };
  }
  if (p.kind === 'account') {
    const existing = ctx.assets.find((a) => sameName(a.name, p.name)) ?? null;
    return {
      type: 'asset', name: existing?.name ?? p.name, assetKind: existing?.kind ?? p.assetKind ?? 'cash', amountCents: toCents(p.amount),
      currency: p.currency ?? existing?.currency ?? ctx.currency,
      existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency } : null,
    };
  }
  if (p.kind === 'debt') {
    const existing = ctx.liabilities.find((l) => sameName(l.name, p.name)) ?? null;
    return {
      type: 'debt', name: existing?.name ?? p.name, debtKind: existing?.kind ?? p.debtKind ?? 'other', amountCents: toCents(p.amount),
      currency: p.currency ?? existing?.currency ?? ctx.currency, dueDate: p.date ? noon(p.date) : existing?.dueDate ?? null,
      existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, balanceCents: Math.round(existing.balance * 100), currency: existing.currency, dueDate: existing.dueDate } : null,
    };
  }
  if (!p.symbol || !(p.quantity && p.quantity > 0)) return null;
  const symbol = p.symbol.toUpperCase();
  const existing = ctx.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
  return {
    type: 'holding', symbol, name: existing?.name ?? p.name, holdingKind: existing?.kind ?? p.holdingKind ?? 'stock',
    quantity: p.quantity, mode: p.holdingMode ?? 'add', priceCents: p.amount === null ? null : toCents(p.amount),
    currency: p.currency ?? existing?.currency ?? 'USD',
    existing: existing ? { id: existing.id, name: existing.name, kind: existing.kind, quantity: existing.quantity, costBasisCents: Math.round(existing.costBasis * 100), currency: existing.currency, acquiredAt: existing.acquiredAt ?? today } : null,
  };
}
