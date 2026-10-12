import { draftProblems, parse, parseDate, parseMoney, type AskContext, type Draft } from './parse';

const now = new Date(2026, 9, 12, 10, 0); // 12 Oct 2026, local time
const ctx: AskContext = {
  currency: 'EUR',
  now,
  categories: [
    { id: 'c-dining', name: 'Dining', kind: 'expense' },
    { id: 'c-rent', name: 'Rent', kind: 'expense' },
    { id: 'c-subs', name: 'Subscriptions', kind: 'expense' },
    { id: 'c-free', name: 'Freelance', kind: 'income' },
    { id: 'c-sal', name: 'Salary', kind: 'income' },
  ],
  assets: [{ id: 'a-bank', name: 'Main account', kind: 'cash', balance: 1000, currency: 'EUR' }],
  liabilities: [{ id: 'l-card', name: 'Card', kind: 'credit_card', balance: 100, currency: 'EUR', dueDate: null }],
  holdings: [{ id: 'h-btc', symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', quantity: 0.5, costBasis: 15000, currency: 'USD', acquiredAt: 1 }],
};
const draft = (text: string): Draft => {
  const r = parse(text, ctx);
  if (r.type !== 'draft') throw new Error(`${text} → ${JSON.stringify(r)}`);
  return r.draft;
};

describe('parseMoney', () => {
  it.each([
    ['4.50', 450, null], ['4,50', 450, null], ['1,200', 120_000, null], ['€35', 3_500, 'EUR'], ['$12.5k', 1_250_000, 'USD'],
    ['250k', 25_000_000, null], ['1.2m', 120_000_000, null], ['20 usd', 2_000, 'USD'], ['15 euros', 1_500, 'EUR'],
  ])('%s', (text, cents, currency) => {
    expect(parseMoney(text)).toMatchObject({ cents, currency });
  });
});

describe('parseDate', () => {
  it('reads relative and calendar days, choosing the sensible year', () => {
    expect(new Date(parseDate('yesterday', now, 'past')!.at).getDate()).toBe(11);
    expect(new Date(parseDate('3 oct', now, 'past')!.at).toDateString()).toBe(new Date(2026, 9, 3).toDateString());
    expect(new Date(parseDate('dec 20', now, 'past')!.at).getFullYear()).toBe(2025);
    expect(new Date(parseDate('due 2 jan', now, 'future')!.at).getFullYear()).toBe(2027);
    expect(new Date(parseDate('in 5 days', now, 'future')!.at).getDate()).toBe(17);
  });
});

describe('parse', () => {
  it('reads spending and picks a category', () => {
    expect(draft('coffee 4.50')).toMatchObject({ type: 'transaction', kind: 'expense', description: 'Coffee', amountCents: 450, currency: 'EUR', categoryId: 'c-dining' });
    expect(draft('spent 1,200 on rent yesterday')).toMatchObject({ kind: 'expense', description: 'Rent', amountCents: 120_000, categoryId: 'c-rent' });
    expect(draft('Netflix $15.99')).toMatchObject({ currency: 'USD', amountCents: 1_599, categoryName: 'Subscriptions' });
    expect(draft('paint for the office 80')).toMatchObject({ description: 'Paint office', categoryId: null });
  });

  it('reads income and who paid', () => {
    expect(draft('got paid 5,000 from Client A')).toMatchObject({ kind: 'income', description: 'Client A', amountCents: 500_000, categoryId: 'c-free' });
    expect(draft('salary 3200')).toMatchObject({ kind: 'income', categoryId: 'c-sal' });
    expect(draft('+250 refund')).toMatchObject({ kind: 'income', amountCents: 25_000 });
  });

  it('updates a known account balance or adds a new one', () => {
    expect(draft('main account balance 12,500')).toMatchObject({ type: 'asset', name: 'Main account', amountCents: 1_250_000, existing: { id: 'a-bank', balanceCents: 100_000 } });
    expect(draft('I have 3,000 in savings')).toMatchObject({ type: 'asset', name: 'Savings', assetKind: 'cash', existing: null });
    expect(draft('flat worth 250k')).toMatchObject({ type: 'asset', name: 'Flat', assetKind: 'real_estate', amountCents: 25_000_000 });
    expect(draft('watch worth 8000')).toMatchObject({ assetKind: 'collectible' });
  });

  it('reads debts with due dates, matching known ones', () => {
    const d = draft('owe 420 on card due 20 oct');
    expect(d).toMatchObject({ type: 'debt', name: 'Card', amountCents: 42_000, existing: { id: 'l-card' } });
    expect(d.type === 'debt' && new Date(d.dueDate!).getDate()).toBe(20);
    expect(draft('car loan 20000')).toMatchObject({ type: 'debt', name: 'Car loan', debtKind: 'loan', existing: null });
  });

  it('reads holdings with a unit or total price', () => {
    expect(draft('bought 10 VOO at $500')).toMatchObject({ type: 'holding', symbol: 'VOO', holdingKind: 'etf', quantity: 10, priceCents: 50_000, currency: 'USD', mode: 'add', existing: null });
    expect(draft('bought 0.1 btc for 6,000')).toMatchObject({ symbol: 'BTC', quantity: 0.1, priceCents: 6_000_000, mode: 'add', existing: { id: 'h-btc' } });
    expect(draft('I own 3 AAPL')).toMatchObject({ symbol: 'AAPL', holdingKind: 'stock', mode: 'set', priceCents: null });
  });

  it('answers questions instead of drafting', () => {
    expect(parse('what is my net worth?', ctx)).toEqual({ type: 'question', topic: 'net' });
    expect(parse('how much do I owe', ctx)).toEqual({ type: 'question', topic: 'owe' });
    expect(parse('how much cash do I have', ctx)).toEqual({ type: 'question', topic: 'cash' });
    expect(parse('what did I spend this month?', ctx)).toEqual({ type: 'question', topic: 'spent' });
    expect(parse('what is the weather?', ctx)).toEqual({ type: 'question', topic: 'help' });
  });

  it('gives up honestly without an amount', () => {
    expect(parse('coffee', ctx)).toEqual({ type: 'unknown' });
    expect(parse('', ctx)).toEqual({ type: 'unknown' });
  });
});

describe('draftProblems', () => {
  it('never lets a holding save without what was paid', () => {
    expect(draftProblems(draft('I own 3 AAPL'))).toEqual(['Add the price you paid per AAPL.']);
    expect(draftProblems(draft('bought 10 VOO at 500'))).toEqual([]);
    expect(draftProblems({ ...draft('coffee 4.50'), amountCents: 0 } as Draft)).toEqual(['Add an amount.']);
  });
});
