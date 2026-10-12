import type { CloudSnapshot, CloudTransaction } from '@/cloud/api';
import { convertCents, type FxRate } from '@/data/fx';
import type { Currency, FlowLine, MonthFlow } from '@/domain/types';

export type MonthKey = { year: number; month: number };
const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Records stamped slightly after the screen's clock still count as now. */
const CLOCK_SLACK = 3_600_000;

export const monthName = (k: MonthKey, now: Date) => NAMES[k.month] + (k.year !== now.getFullYear() ? ` ${k.year}` : '');
export const sameMonth = (a: MonthKey, b: MonthKey) => a.year === b.year && a.month === b.month;
export const monthOf = (ms: number): MonthKey => { const d = new Date(ms); return { year: d.getFullYear(), month: d.getMonth() }; };
export const shiftMonth = (k: MonthKey, by: number): MonthKey => { const d = new Date(k.year, k.month + by, 1); return { year: d.getFullYear(), month: d.getMonth() }; };

/** Months from the first transaction to now, newest last. Always includes the current month. */
export function availableMonths(txs: CloudTransaction[], now: Date): MonthKey[] {
  const current = monthOf(now.getTime());
  const first = txs.reduce((m, t) => Math.min(m, t.occurredAt), now.getTime());
  const out: MonthKey[] = [];
  for (let k = monthOf(first); k.year < current.year || (k.year === current.year && k.month <= current.month); k = shiftMonth(k, 1)) out.push(k);
  return out;
}

/** The month's transactions, newest first. Future-dated ones (beyond the clock slack) are left out. */
export function transactionsIn(txs: CloudTransaction[], k: MonthKey, now: Date): CloudTransaction[] {
  const start = new Date(k.year, k.month, 1).getTime();
  const end = new Date(k.year, k.month + 1, 1).getTime();
  return txs.filter((t) => t.occurredAt >= start && t.occurredAt < end && t.occurredAt <= now.getTime() + CLOCK_SLACK).sort((a, b) => b.occurredAt - a.occurredAt);
}

/**
 * Where money came from and went in one month, in the portfolio currency, grouped by
 * category (or description), each stream remembering its transactions.
 */
export function monthFlow(s: CloudSnapshot, k: MonthKey, currency: Currency, fx: FxRate | null, now: Date): MonthFlow & { unconverted: string[] } {
  const names = new Map(s.categories.map((c) => [c.id, c.name]));
  const groups = { income: new Map<string, FlowLine>(), expense: new Map<string, FlowLine>() };
  const unconverted: string[] = [];
  for (const tx of transactionsIn(s.transactions, k, now)) {
    const cents = convertCents(Math.abs(tx.amountMinor), tx.currency, currency, fx);
    if (cents === null) { unconverted.push(tx.description); continue; }
    const label = (tx.categoryId && names.get(tx.categoryId)) || tx.description || (tx.kind === 'income' ? 'Income' : 'Spending');
    const g = groups[tx.kind];
    const line = g.get(label) ?? { id: `${tx.kind}:${label}`, label, cents: 0, txIds: [] };
    line.cents += cents;
    line.txIds!.push(tx.id);
    g.set(label, line);
  }
  const sorted = (g: Map<string, FlowLine>) => [...g.values()].sort((a, b) => b.cents - a.cents);
  return { month: monthName(k, now), incoming: sorted(groups.income), outgoing: sorted(groups.expense), unconverted };
}
