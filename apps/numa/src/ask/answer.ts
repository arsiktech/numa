import type { FlowSummary } from '@/domain/flow';
import { formatMoney } from '@/domain/money';
import type { Summary } from '@/domain/summary';
import type { Currency, MonthFlow } from '@/domain/types';
import type { Topic } from './parse';

export type AnswerData = { summary: Summary; available: boolean; currency: Currency; month: MonthFlow; flow: FlowSummary; debts: { name: string; balanceCents: number }[] };

export const EXAMPLES = ['Coffee 4.50', 'Got paid 3,000 from Client A', 'Bank balance 12,500', 'Bought 10 VOO at $500', 'Owe 420 on card due 20 Oct', 'What’s my net worth?'];

/** One or two plain sentences from the person's own numbers. Never guesses. */
export function answer(topic: Topic, d: AnswerData): string {
  // Small amounts keep their cents, so €4.50 never reads as €4. Big totals stay whole.
  const m = (cents: number, cents2 = false) => formatMoney(cents, d.currency, { cents: cents2 || (Math.abs(cents) < 100_000 && cents % 100 !== 0) });
  if (topic === 'help') return `I can add money and answer questions about it. Try “${EXAMPLES[0]}”, “${EXAMPLES[3]}” or “How much cash do I have?”`;
  if (!d.available && ['net', 'cash', 'liquid', 'owe'].includes(topic)) return 'Totals need today’s exchange rate, and it hasn’t loaded. Try again in a moment.';
  const s = d.summary;
  const left = s.unknown.length ? ` ${s.unknown.length} without a value ${s.unknown.length === 1 ? 'is' : 'are'} left out.` : '';
  switch (topic) {
    case 'net':
      return `Net worth is ${m(s.netCents, true)}. You own ${m(s.ownCents)} and owe ${m(s.oweCents)}.${left}`;
    case 'cash':
      return `Cash is ${m(s.cashCents)}${s.netCents > 0 ? `, ${Math.round((s.cashCents / Math.max(1, s.ownCents)) * 100)}% of what you own` : ''}.`;
    case 'liquid':
      return `You could have ${m(s.liquidCents)} within a week: cash plus anything you can sell quickly.${left}`;
    case 'owe': {
      if (!d.debts.length) return 'You don’t owe anything Numa knows about.';
      const top = [...d.debts].sort((a, b) => b.balanceCents - a.balanceCents)[0];
      return `You owe ${m(s.oweCents)} across ${d.debts.length} ${d.debts.length === 1 ? 'debt' : 'debts'}. The biggest is ${top.name}, ${m(top.balanceCents)}.`;
    }
    case 'spent': {
      if (!d.flow.outCents) return `Nothing spent in ${d.month.month} so far.`;
      const top = d.month.outgoing[0];
      return `You’ve spent ${m(d.flow.outCents)} in ${d.month.month} so far. The biggest is ${top.label}, ${m(top.cents)}.`;
    }
    case 'income':
      return d.flow.inCents ? `${m(d.flow.inCents)} came in this ${d.month.month}.` : `Nothing has come in this ${d.month.month} yet.`;
    case 'kept':
      if (!d.flow.inCents && !d.flow.outCents) return `Nothing logged in ${d.month.month} yet.`;
      return d.flow.keptCents >= 0
        ? `You kept ${m(d.flow.keptCents)} in ${d.month.month}, ${Math.round(d.flow.keptShare * 100)}% of what came in.`
        : `${m(-d.flow.keptCents)} more went out than came in this ${d.month.month}.`;
  }
}
