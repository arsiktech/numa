import { formatMoney } from '@/domain/money';
import type { AnswerData } from './answer';
import type { Point } from '@/data/series';
import type { AskContext } from './parse';

const LIMIT = 12_000;
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * The short summary of the person's own numbers that goes to Claude with a question that the
 * device couldn't answer. Names and amounts only: no email, no ids, no transaction history.
 */
export function aiContext(ctx: AskContext, a: AnswerData, history: Point[] = []): string {
  const m = (cents: number, currency = a.currency) => formatMoney(cents, currency);
  const major = (amount: number, currency: AskContext['currency']) => formatMoney(Math.round(amount * 100), currency);
  const s = a.summary;
  const lines: string[] = [
    `Today: ${day(ctx.now.getTime())}. Home currency: ${a.currency}.`,
    a.available
      ? `Net worth ${m(s.netCents)}: owns ${m(s.ownCents)}, owes ${m(s.oweCents)}. Cash ${m(s.cashCents)}. Could have ${m(s.liquidCents)} within a week, ${m(s.liquidAfterDebtsCents)} after everything owed.`
      : 'Totals are unavailable right now because an exchange rate is missing.',
  ];
  if (s.unknown.length) lines.push(`Left out of totals because their value is unknown: ${s.unknown.map((h) => h.name).join(', ')}.`);
  if (s.categories.length) lines.push(`What they own by group: ${s.categories.map((c) => `${c.category} ${m(c.cents)}`).join(', ')}.`);
  if (ctx.assets.length) lines.push('Accounts and things:', ...ctx.assets.map((x) => `- ${x.name} (${x.kind}): ${major(x.balance, x.currency)}`));
  if (ctx.liabilities.length) lines.push('Debts:', ...ctx.liabilities.map((x) => `- ${x.name} (${x.kind}): ${major(x.balance, x.currency)}${x.dueDate ? `, due ${day(x.dueDate)}` : ''}`));
  if (ctx.holdings.length) lines.push('Investments:', ...ctx.holdings.map((x) => `- ${x.symbol} ${x.name} (${x.kind}): ${x.quantity} units, paid ${major(x.costBasis, x.currency)} in total`));
  const f = a.flow;
  lines.push(`This month (${a.month.month}): in ${m(f.inCents)}, out ${m(f.outCents)}, kept ${m(f.keptCents)}.`);
  if (a.month.incoming.length) lines.push(`Came in from: ${a.month.incoming.slice(0, 10).map((l) => `${l.label} ${m(l.cents)}`).join(', ')}.`);
  if (a.month.outgoing.length) lines.push(`Went to: ${a.month.outgoing.slice(0, 12).map((l) => `${l.label} ${m(l.cents)}`).join(', ')}.`);
  // Recorded net-worth points (oldest first), so trends and "what changed" can be answered.
  const past = history.slice(-12);
  if (past.length) lines.push('Net worth over time:', ...past.map((p) => `- ${day(p.t)}: ${m(p.cents)}${p.parts ? ` (owned ${m(p.parts.liquidCents + p.parts.investedCents + p.parts.hardCents)}, owed ${m(p.parts.oweCents)})` : ''}`));
  const cats = (kind: 'expense' | 'income') => ctx.categories.filter((c) => c.kind === kind).map((c) => c.name);
  if (ctx.categories.length) lines.push(`Spending categories: ${cats('expense').join(', ') || 'none'}. Income categories: ${cats('income').join(', ') || 'none'}.`);
  const text = lines.join('\n');
  return text.length > LIMIT ? `${text.slice(0, LIMIT - 20)}\n(list cut short)` : text;
}
