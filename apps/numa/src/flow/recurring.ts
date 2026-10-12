import type { CloudRecurring } from '@/cloud/api';
import { convertCents, type FxRate } from '@/data/fx';
import type { Currency } from '@/domain/types';

const PER_MONTH: Record<CloudRecurring['cadence'], number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export type RecurringRow = { id: string; description: string; kind: 'income' | 'expense'; monthlyCents: number | null; cadence: CloudRecurring['cadence']; nextRunAt: number; revenue: boolean };

/** Active rules as monthly amounts in the portfolio currency, biggest first. Ended and paused rules are left out. */
export function recurringRows(rules: CloudRecurring[], currency: Currency, fx: FxRate | null, now: number): RecurringRow[] {
  return rules
    .filter((r) => r.active && (r.endAt === null || r.endAt > now) && r.startAt <= now)
    .map((r) => {
      const cents = convertCents(Math.round(r.amount * 100), r.currency, currency, fx);
      return { id: r.id, description: r.incomeSource ?? r.description, kind: r.kind, cadence: r.cadence, nextRunAt: r.nextRunAt, revenue: r.revenueType !== null, monthlyCents: cents === null ? null : Math.round(cents * PER_MONTH[r.cadence]) };
    })
    .sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1));
}

/**
 * Monthly recurring revenue: only income explicitly marked as a subscription or retainer
 * counts. Unmarked income (salary, one-off clients) never inflates MRR.
 */
export function mrr(rows: RecurringRow[]): { mrrCents: number; arrCents: number; products: RecurringRow[]; unknown: number } | null {
  const products = rows.filter((r) => r.kind === 'income' && r.revenue);
  if (!products.length) return null;
  const known = products.filter((r) => r.monthlyCents !== null);
  const mrrCents = known.reduce((s, r) => s + r.monthlyCents!, 0);
  return { mrrCents, arrCents: mrrCents * 12, products, unknown: products.length - known.length };
}
