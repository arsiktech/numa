import { CREATED, type Op } from '@/ask/plan';
import type { CloudCategory, CloudGoal, CloudSnapshot } from '@/cloud/api';
import { convertCents, type FxRate } from '@/data/fx';
import type { Summary } from '@/domain/summary';
import type { Currency } from '@/domain/types';
import { monthFlow, monthOf, shiftMonth } from '@/flow/month';

/**
 * Runway: how long cash lasts at the recent pace of spending. It uses the last three
 * full months; with less history it says so rather than guessing from a few days.
 */
export function runway(s: CloudSnapshot, summary: Summary, currency: Currency, fx: FxRate | null, now: Date): { cashCents: number; monthlyOutCents: number | null; months: number | null; basisMonths: number } {
  const current = monthOf(now.getTime());
  const outs: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const k = shiftMonth(current, -i);
    const f = monthFlow(s, k, currency, fx, now);
    if (f.incoming.length === 0 && f.outgoing.length === 0) continue;
    outs.push(f.outgoing.reduce((t, l) => t + l.cents, 0));
  }
  if (!outs.length) return { cashCents: summary.cashCents, monthlyOutCents: null, months: null, basisMonths: 0 };
  const monthlyOutCents = Math.round(outs.reduce((a, b) => a + b, 0) / outs.length);
  return { cashCents: summary.cashCents, monthlyOutCents, months: monthlyOutCents > 0 ? summary.cashCents / monthlyOutCents : null, basisMonths: outs.length };
}

export function runwayWords(months: number | null): string {
  if (months === null) return 'No spending logged in the last three months';
  if (months >= 36) return 'More than 3 years on cash';
  if (months >= 12) return `About ${Math.round(months / 12 * 10) / 10} years on cash`;
  if (months < 1) return 'Less than a month on cash';
  return `About ${Math.round(months)} ${Math.round(months) === 1 ? 'month' : 'months'} on cash`;
}

export type LimitRow = { category: CloudCategory; limitCents: number | null; spentCents: number; share: number | null };

/** Spending this month per expense category against its monthly limit, in the portfolio currency. */
export function limits(s: CloudSnapshot, currency: Currency, fx: FxRate | null, now: Date): LimitRow[] {
  const flow = monthFlow(s, monthOf(now.getTime()), currency, fx, now);
  const spent = new Map(flow.outgoing.map((l) => [l.label, l.cents]));
  return s.categories
    .filter((c) => c.kind === 'expense')
    .map((c) => {
      const limitCents = c.monthlyLimit == null ? null : convertCents(Math.round(c.monthlyLimit * 100), c.budgetCurrency ?? currency, currency, fx);
      const spentCents = spent.get(c.name) ?? 0;
      return { category: c, limitCents, spentCents, share: limitCents ? spentCents / limitCents : null };
    })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.spentCents - a.spentCents);
}

export type GoalRow = { goal: CloudGoal; title: string; currentCents: number | null; targetCents: number | null; share: number | null };

/** Where each goal stands now. Unknown progress stays unknown, never zero. */
export function goalRows(s: CloudSnapshot, summary: Summary, currency: Currency, fx: FxRate | null, now: Date, valueOf: (id: string) => number | null): GoalRow[] {
  const flow = monthFlow(s, monthOf(now.getTime()), currency, fx, now);
  const names = new Map(s.categories.map((c) => [c.id, c.name]));
  return (s.goals ?? []).map((goal) => {
    const targetCents = convertCents(Math.round(goal.target * 100), goal.currency, currency, fx);
    let currentCents: number | null = null;
    let title = goal.label ?? '';
    switch (goal.scope) {
      case 'net_worth': currentCents = summary.netCents; title ||= 'Net worth'; break;
      case 'monthly_income': currentCents = flow.incoming.reduce((t, l) => t + l.cents, 0); title ||= 'Income this month'; break;
      case 'income_category': {
        const name = goal.categoryId ? names.get(goal.categoryId) : undefined;
        currentCents = name ? flow.incoming.find((l) => l.label === name)?.cents ?? 0 : null;
        title ||= `${name ?? 'Income'} this month`;
        break;
      }
      case 'asset_value': currentCents = goal.assetId ? valueOf(goal.assetId) : null; title ||= s.assets.find((a) => a.id === goal.assetId)?.name ?? 'Asset'; break;
      case 'holding_value': currentCents = goal.holdingId ? valueOf(goal.holdingId) : null; title ||= s.holdings.find((h) => h.id === goal.holdingId)?.name ?? 'Holding'; break;
    }
    return { goal, title, currentCents, targetCents, share: currentCents !== null && targetCents ? Math.max(0, currentCents / targetCents) : null };
  });
}

/** Setting or clearing a limit, with Undo writing the old limit back. */
export function limitPlan(c: CloudCategory, limitCents: number | null): { apply: Op; undo: Op } {
  const old = c.monthlyLimit ?? null;
  return {
    apply: { fn: 'updateCategory', args: { id: c.id, patch: { monthlyLimit: limitCents === null ? null : limitCents / 100 } } },
    undo: { fn: 'updateCategory', args: { id: c.id, patch: { monthlyLimit: old } } },
  };
}

export type GoalFields = { scope: 'net_worth' | 'monthly_income'; targetCents: number; currency: Currency; deadline: number | null; label: string };

const goalArgs = (portfolioId: string, f: GoalFields, startAt: number, createdAt: number, id?: string) => ({
  ...(id ? { id } : {}), portfolioId, scope: f.scope, target: f.targetCents / 100, currency: f.currency, startAt, createdAt,
  ...(f.deadline !== null ? { deadline: f.deadline } : {}), ...(f.label.trim() ? { label: f.label.trim() } : {}),
});

export function goalCreatePlan(portfolioId: string, f: GoalFields, now: number): { apply: Op; undo: Op } {
  return { apply: { fn: 'upsertGoal', args: goalArgs(portfolioId, f, now, now) }, undo: { fn: 'removeGoal', args: { id: CREATED } } };
}

export function goalDeletePlan(portfolioId: string, g: CloudGoal): { apply: Op; undo: Op } {
  const args = {
    portfolioId, scope: g.scope, target: g.target, currency: g.currency, startAt: g.startAt, createdAt: g.createdAt,
    ...(g.deadline !== null ? { deadline: g.deadline } : {}), ...(g.label ? { label: g.label } : {}),
    ...(g.categoryId ? { categoryId: g.categoryId } : {}), ...(g.assetId ? { assetId: g.assetId } : {}), ...(g.holdingId ? { holdingId: g.holdingId } : {}),
  };
  return { apply: { fn: 'removeGoal', args: { id: g.id } }, undo: { fn: 'upsertGoal', args } };
}
