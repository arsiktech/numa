import { convertCents, type FxRate } from '@/data/fx';
import type { Draft } from './parse';

/** One call to a Convex write, named by its key in `cloud`. `id: CREATED` means "the record the save made". */
export type WriteName = 'createTransaction' | 'deleteTransaction' | 'upsertAsset' | 'deleteAsset' | 'upsertLiability' | 'deleteLiability' | 'upsertHolding' | 'deleteHolding';
export type Op = { fn: WriteName; args: Record<string, unknown> };
export const CREATED = '__created__';
export type Plan = { apply: Op; undo: Op } | { error: string };

const major = (cents: number) => Math.round(cents) / 100;
const qty = (n: number) => Math.round(n * 1e8) / 1e8;

/** What Save writes and what Undo writes back. Pure, so it is tested without a backend. */
export function plan(d: Draft, portfolioId: string, fx: FxRate | null, now: number): Plan {
  switch (d.type) {
    case 'transaction':
      return {
        apply: { fn: 'createTransaction', args: { portfolioId, occurredAt: d.occurredAt, description: d.description.trim(), kind: d.kind, amount: major(d.amountCents), currency: d.currency, ...(d.categoryId ? { categoryId: d.categoryId } : {}) } },
        undo: { fn: 'deleteTransaction', args: { id: CREATED } },
      };
    case 'asset': {
      if (d.existing) {
        const e = d.existing;
        return {
          apply: { fn: 'upsertAsset', args: { id: e.id, portfolioId, name: e.name, kind: e.kind, balance: major(d.amountCents), currency: d.currency } },
          undo: { fn: 'upsertAsset', args: { id: e.id, portfolioId, name: e.name, kind: e.kind, balance: major(e.balanceCents), currency: e.currency } },
        };
      }
      return {
        apply: { fn: 'upsertAsset', args: { portfolioId, name: d.name.trim(), kind: d.assetKind, balance: major(d.amountCents), currency: d.currency } },
        undo: { fn: 'deleteAsset', args: { id: CREATED } },
      };
    }
    case 'debt': {
      const due = (v: number | null) => (v === null ? {} : { dueDate: v });
      if (d.existing) {
        const e = d.existing;
        return {
          apply: { fn: 'upsertLiability', args: { id: e.id, portfolioId, name: e.name, kind: e.kind, balance: major(d.amountCents), currency: d.currency, ...due(d.dueDate) } },
          undo: { fn: 'upsertLiability', args: { id: e.id, portfolioId, name: e.name, kind: e.kind, balance: major(e.balanceCents), currency: e.currency, ...due(e.dueDate) } },
        };
      }
      return {
        apply: { fn: 'upsertLiability', args: { portfolioId, name: d.name.trim(), kind: d.debtKind, balance: major(d.amountCents), currency: d.currency, ...due(d.dueDate) } },
        undo: { fn: 'deleteLiability', args: { id: CREATED } },
      };
    }
    case 'holding': {
      const e = d.existing;
      const currency = e?.currency ?? d.currency;
      const paid = d.priceCents === null ? null : convertCents(Math.round(d.priceCents * d.quantity), d.currency, currency, fx);
      if (d.priceCents !== null && paid === null) return { error: 'This needs today’s exchange rate, which hasn’t loaded. Try again in a moment.' };
      if (!e) {
        if (paid === null || paid <= 0) return { error: `Add the price you paid per ${d.symbol}.` };
        return {
          apply: { fn: 'upsertHolding', args: { portfolioId, symbol: d.symbol, name: d.name, kind: d.holdingKind, quantity: qty(d.quantity), costBasis: major(paid), currency, acquiredAt: now } },
          undo: { fn: 'deleteHolding', args: { id: CREATED } },
        };
      }
      const quantity = d.mode === 'add' ? qty(e.quantity + d.quantity) : qty(d.quantity);
      if (d.mode === 'add' && paid === null) return { error: `Add the price you paid per ${d.symbol}.` };
      const costCents = d.mode === 'add' ? e.costBasisCents + paid! : paid ?? e.costBasisCents;
      const base = { id: e.id, portfolioId, symbol: d.symbol, name: e.name, kind: e.kind, currency, acquiredAt: e.acquiredAt };
      return {
        apply: { fn: 'upsertHolding', args: { ...base, quantity, costBasis: major(costCents) } },
        undo: { fn: 'upsertHolding', args: { ...base, quantity: e.quantity, costBasis: major(e.costBasisCents) } },
      };
    }
  }
}

/** Fills in the id of the record Save created, for Undo. */
export function bindUndo(undo: Op, createdId: string): Op {
  return undo.args.id === CREATED ? { ...undo, args: { ...undo.args, id: createdId } } : undo;
}
