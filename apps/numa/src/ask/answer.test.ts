import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { answer, type AnswerData } from './answer';

const now = new Date('2026-10-12T10:00:00Z');
const summary = summarize(
  [{ id: 'a', name: 'Bank', category: 'cash', liquidity: { kind: 'cash' }, valuation: { kind: 'manual', valueCents: 1_250_000, asOf: now.toISOString(), remindAfterDays: 30 } }],
  [{ id: 'd', name: 'Card', balanceCents: 42_000 }],
  now,
);
const month = { month: 'October', incoming: [{ id: 'x', label: 'Client A', cents: 500_000 }], outgoing: [{ id: 'r', label: 'Rent', cents: 120_000 }] };
const data: AnswerData = { summary, available: true, currency: 'EUR', month, flow: summarizeFlow(month), debts: [{ name: 'Card', balanceCents: 42_000 }] };

describe('answer', () => {
  it('states totals from the person’s own numbers', () => {
    expect(answer('net', data)).toBe('Net worth is €12,080.00. You own €12,500 and owe €420.');
    expect(answer('owe', data)).toBe('You owe €420 across 1 debt. The biggest is Card, €420.');
    expect(answer('spent', data)).toBe('You’ve spent €1,200 in October so far. The biggest is Rent, €1,200.');
    expect(answer('kept', data)).toBe('You kept €3,800 in October, 76% of what came in.');
    const small = { ...month, outgoing: [{ id: 'd', label: 'Dining', cents: 450 }] };
    const coffee = { ...data, month: small, flow: summarizeFlow(small) };
    expect(answer('spent', coffee)).toBe('You’ve spent €4.50 in October so far. The biggest is Dining, €4.50.');
  });
  it('says what could be cash within a week, before and after what is owed', () => {
    expect(answer('liquid', data)).toBe('You could have €12,500 within a week: cash plus anything you can sell quickly. After what you owe, €12,080.');
  });
  it('says so plainly when debts are bigger than what could be cash within a week', () => {
    const deep = summarize(
      [{ id: 'a', name: 'Bank', category: 'cash', liquidity: { kind: 'cash' }, valuation: { kind: 'manual', valueCents: 100_000, asOf: now.toISOString(), remindAfterDays: 30 } }],
      [{ id: 'd', name: 'Loan', balanceCents: 450_000 }],
      now,
    );
    expect(answer('liquid', { ...data, summary: deep, debts: [{ name: 'Loan', balanceCents: 450_000 }] }))
      .toBe('You could have €1,000 within a week: cash plus anything you can sell quickly. After the €4,500 you owe, you’d be €3,500 short.');
  });
  it('gives only the one figure when nothing is owed', () => {
    const clear = summarize(
      [{ id: 'a', name: 'Bank', category: 'cash', liquidity: { kind: 'cash' }, valuation: { kind: 'manual', valueCents: 100_000, asOf: now.toISOString(), remindAfterDays: 30 } }],
      [],
      now,
    );
    expect(answer('liquid', { ...data, summary: clear, debts: [] })).toBe('You could have €1,000 within a week: cash plus anything you can sell quickly.');
  });
  it('refuses to state totals without an exchange rate', () => {
    expect(answer('net', { ...data, available: false })).toMatch(/exchange rate/);
  });
});
