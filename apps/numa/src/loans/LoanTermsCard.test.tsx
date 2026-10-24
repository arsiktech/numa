import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import type { CloudLiability } from '@/cloud/api';
import type { DebtEvent } from '@/data/moneyMap';
import { LoanTermsCard, LoanTermsForm, hasTerms, laterDate, pastDate } from './LoanTermsCard';

let mockHidden = false;
const mockSave = jest.fn(async () => undefined);
const mockToast = jest.fn();
jest.mock('@/ui/money', () => ({ useMoney: () => ({ mask: (t: string) => (mockHidden ? t.replace(/[0-9]/g, '•') : t), hidden: mockHidden }) }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { bg: '#000', ink: '#fff', ink2: '#aaa', ink3: '#777', s1: '#111', s2: '#222', line2: '#444', down: '#f55', warn: '#fa0' } }) }));
jest.mock('@/theme/webFont', () => ({ webFont: (f: string) => f }));
jest.mock('@/ui/Toast', () => ({ useToast: () => mockToast }));
jest.mock('./useMoneyMap', () => ({ useTermsWrite: () => mockSave, eventErrorText: (e: unknown) => `error: ${String(e)}` }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const NOW = day(2026, 10, 24);
const loan = (over: Partial<CloudLiability> = {}): CloudLiability => ({
  id: 'l1', name: 'Loan from a friend', kind: 'loan', balance: 20_000, currency: 'EUR', dueDate: null, updatedAt: 0,
  principal: 20_000, startedAt: day(2026, 7, 1), dueKind: 'flexible', interestTerms: 'simple', interestRate: 8, ...over,
} as CloudLiability);
const event = (over: Partial<DebtEvent>): DebtEvent => ({ id: 'e', subject: 'liability:l1', kind: 'repaid', amount: null, unit: 'EUR', applied: true, occurredAt: day(2026, 8, 15), note: null, ...over });

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; mockHidden = false; mockSave.mockClear(); mockToast.mockClear(); });
type Json = TestRenderer.ReactTestRendererJSON | string;
const flat = (n: Json | Json[] | null): string => (n === null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : (n.children ?? []).map(flat).join(''));
/** Everything shown, with text split across nodes joined back together. */
const text = () => flat(tree!.toJSON() as Json | Json[] | null);
const textIn = (i: TestRenderer.ReactTestInstance): string => i.children.map((c) => (typeof c === 'string' ? c : textIn(c))).join('');
const render = (el: React.ReactElement) => { act(() => { tree = TestRenderer.create(el); }); };

describe('LoanTermsCard', () => {
  it('shows the principal still owed, the terms, and the interest worked out from them', () => {
    render(<LoanTermsCard loan={loan()} events={[]} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('Original amount');
    expect(text()).toContain('€20,000.00');
    expect(text()).toContain('8% a year, simple');
    expect(text()).toContain('Interest accrued');
    expect(text()).toContain('€399.99');
    expect(text()).toContain('Interest owed');
    expect(text()).toContain('not counted in What you owe');
  });

  it('shows what was paid, split into principal, interest and fees', () => {
    const events = [event({ amount: 1_000, principalPart: 800, interestPart: 150, feePart: 50 })];
    render(<LoanTermsCard loan={loan({ balance: 19_200 })} events={events} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('Paid so far');
    expect(text()).toContain('principal €800.00, interest €150.00, fees €50.00');
    expect(text()).toContain('€244.66');
  });

  it('says interest is paid ahead instead of hiding a negative amount', () => {
    const events = [event({ amount: 1_000, principalPart: 0, interestPart: 1_000, feePart: 0, occurredAt: day(2026, 7, 5) })];
    render(<LoanTermsCard loan={loan()} events={events} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('Interest paid ahead');
    expect(text()).toContain('€600.01');
  });

  it('warns when the history and the balance disagree', () => {
    render(<LoanTermsCard loan={loan({ balance: 18_000 })} events={[]} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('the interest may be off');
  });

  it('calculates nothing for manual or interest-free terms, and asks for what simple interest is missing', () => {
    render(<LoanTermsCard loan={loan({ interestTerms: 'manual', interestRate: null })} events={[]} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('Manual: Numa doesn’t calculate it');
    expect(text()).not.toContain('Interest accrued');
    act(() => tree!.update(<LoanTermsCard loan={loan({ interestTerms: 'none', interestRate: null })} events={[]} now={NOW} onEdit={() => undefined} />));
    expect(text()).toContain('Interest-free');
    act(() => tree!.update(<LoanTermsCard loan={loan({ interestRate: null })} events={[]} now={NOW} onEdit={() => undefined} />));
    expect(text()).toContain('Add a yearly rate to work out interest');
  });

  it('marks a fixed loan overdue only when something is still owed', () => {
    const fixed = { dueKind: 'fixed' as const, dueDate: day(2026, 10, 1) };
    render(<LoanTermsCard loan={loan(fixed)} events={[]} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('overdue');
    act(() => tree!.update(<LoanTermsCard loan={loan({ ...fixed, balance: 0 })} events={[]} now={NOW} onEdit={() => undefined} />));
    expect(text()).not.toContain('overdue');
  });

  it('hides every amount when amounts are hidden', () => {
    mockHidden = true;
    render(<LoanTermsCard loan={loan()} events={[]} now={NOW} onEdit={() => undefined} />);
    expect(text()).not.toContain('20,000');
    expect(text()).not.toContain('399');
  });

  it('shows a debt owed in a coin in that coin, with payments only in that coin', () => {
    const coinLoan = loan({ owedSymbol: 'BTC', owedQuantity: 0.4, balance: 31_000, currency: 'USD', principal: null, startedAt: null, dueKind: null, interestTerms: 'manual', interestRate: null });
    const events = [
      event({ amount: 0.1, unit: 'BTC' }),
      event({ id: 'other', amount: 50, unit: 'EUR' }),
    ];
    render(<LoanTermsCard loan={coinLoan} events={events} now={NOW} onEdit={() => undefined} />);
    expect(text()).toContain('0.4 BTC');
    expect(text()).toContain('Paid so far0.1 BTC');
    expect(text()).not.toContain('$');
    expect(text()).not.toContain('€50');
    expect(text()).not.toContain('Original amount');
  });

  it('opens the editor from a button named for what it does', () => {
    const onEdit = jest.fn();
    render(<LoanTermsCard loan={loan()} events={[]} now={NOW} onEdit={onEdit} />);
    const edit = tree!.root.findAll((n) => n.props.accessibilityRole === 'button')[0];
    act(() => edit.props.onPress());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Edit terms');
  });
});

describe('LoanTermsForm', () => {
  const field = (label: string) => tree!.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0];
  const type = (label: string, value: string) => act(() => field(label).props.onChangeText(value));
  const save = () => tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && textIn(n).includes('Save terms'))[0];
  const radio = (group: string, label: string) => tree!.root.findAll((n) => n.props.accessibilityLabel === group && n.props.accessibilityRole === 'radiogroup')[0]
    .findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && textIn(n) === label)[0];

  it('needs the original amount and start date for simple interest, and says so', () => {
    render(<LoanTermsForm loan={loan({ principal: null, startedAt: null, interestTerms: null, interestRate: null, dueKind: null })} now={NOW} onDone={() => undefined} />);
    act(() => radio('Interest', 'Simple').props.onPress());
    type('Yearly rate in percent', '8');
    expect(text()).toContain('Simple interest needs the original amount and the start date');
    expect(save().props.disabled).toBe(true);
  });

  it('refuses a rate above 100 percent, a future start date and a fixed loan without a date', () => {
    render(<LoanTermsForm loan={loan()} now={NOW} onDone={() => undefined} />);
    type('Yearly rate in percent', '120');
    expect(text()).toContain('Simple interest needs a yearly rate above 0 and up to 100');
    type('Yearly rate in percent', '8');
    type('Started (like 2026-07-01 or Jul 2026)', '2027-03-01');
    expect(text()).toContain('isn’t a past date');
    type('Started (like 2026-07-01 or Jul 2026)', '2026-07-01');
    act(() => radio('Repayment', 'Fixed date').props.onPress());
    expect(text()).toContain('A fixed loan needs a repayment date');
  });

  it('saves only what changed, tells you, and closes', async () => {
    const onDone = jest.fn();
    render(<LoanTermsForm loan={loan()} now={NOW} onDone={onDone} />);
    type('Yearly rate in percent', '9');
    await act(async () => { await save().props.onPress(); });
    expect(mockSave).toHaveBeenCalledWith('l1', { interestRate: 9 });
    expect(mockToast).toHaveBeenCalledWith({ text: 'Terms saved' });
    expect(onDone).toHaveBeenCalled();
  });

  it('sends nothing and says so when nothing was changed, so no saved date is rewritten', async () => {
    const onDone = jest.fn();
    render(<LoanTermsForm loan={loan({ startedAt: Date.UTC(2026, 6, 1, 3, 30) })} now={NOW} onDone={onDone} />);
    await act(async () => { await save().props.onPress(); });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ text: 'Nothing changed' });
    expect(onDone).toHaveBeenCalled();
  });

  it('keeps a saved rate and repayment date when only the original amount and start date are added', async () => {
    const legacy = loan({ principal: null, startedAt: null, dueKind: null, interestTerms: null, interestRate: 8, dueDate: day(2026, 11, 1) });
    render(<LoanTermsForm loan={legacy} now={NOW} onDone={() => undefined} />);
    expect(text()).toContain('Repay by');
    type('Original amount in EUR', '20000');
    type('Started (like 2026-07-01 or Jul 2026)', '2026-07-01');
    await act(async () => { await save().props.onPress(); });
    // Neither the rate, the interest kind, the repayment kind nor the date is in what is sent, so none is cleared.
    expect(mockSave).toHaveBeenCalledWith('l1', { principal: 20_000, startedAt: day(2026, 7, 1) });
  });

  it('reads a decimal comma in the original amount, not as thousands', async () => {
    render(<LoanTermsForm loan={loan({ principal: null, startedAt: null, interestTerms: null, interestRate: null, dueKind: null })} now={NOW} onDone={() => undefined} />);
    type('Original amount in EUR', '1234,50');
    await act(async () => { await save().props.onPress(); });
    expect(mockSave).toHaveBeenCalledWith('l1', { principal: 1_234.5 });
    mockSave.mockClear();
    type('Original amount in EUR', '5,000');
    await act(async () => { await save().props.onPress(); });
    expect(mockSave).toHaveBeenCalledWith('l1', { principal: 5_000 });
  });

  it('clears a field only when you empty it', async () => {
    render(<LoanTermsForm loan={loan()} now={NOW} onDone={() => undefined} />);
    type('Original amount in EUR', '');
    expect(text()).toContain('Simple interest needs the original amount and the start date');
    act(() => radio('Interest', 'None').props.onPress());
    await act(async () => { await save().props.onPress(); });
    expect(mockSave).toHaveBeenCalledWith('l1', { principal: null, interestTerms: 'none', interestRate: null });
  });

  it('offers no simple interest on a mortgage or a card, and says why', () => {
    render(<LoanTermsForm loan={loan({ kind: 'mortgage', interestTerms: null, interestRate: null })} now={NOW} onDone={() => undefined} />);
    expect(radio('Interest', 'Simple')).toBeUndefined();
    expect(radio('Interest', 'Manual')).toBeDefined();
    expect(text()).toContain('compound or instalment interest');
    act(() => tree!.update(<LoanTermsForm loan={loan({ kind: 'credit_card', interestTerms: null, interestRate: null })} now={NOW} onDone={() => undefined} />));
    expect(radio('Interest', 'Simple')).toBeUndefined();
  });

  it('sends only the interest kind for a debt owed in a coin', async () => {
    const coinLoan = loan({ owedSymbol: 'BTC', owedQuantity: 0.4, balance: 31_000, currency: 'USD', principal: null, startedAt: null, interestTerms: null, interestRate: null, dueKind: null });
    render(<LoanTermsForm loan={coinLoan} now={NOW} onDone={() => undefined} />);
    act(() => radio('Interest', 'Manual').props.onPress());
    await act(async () => { await save().props.onPress(); });
    expect(mockSave).toHaveBeenCalledWith('l1', { interestTerms: 'manual' });
  });

  it('shows the server’s reason and stays open when saving fails', async () => {
    mockSave.mockRejectedValueOnce(new Error('nope'));
    const onDone = jest.fn();
    render(<LoanTermsForm loan={loan()} now={NOW} onDone={onDone} />);
    type('Yearly rate in percent', '9');
    await act(async () => { await save().props.onPress(); });
    expect(mockToast).toHaveBeenCalledWith({ text: 'error: Error: nope' });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('keeps no original amount or simple interest for a debt owed in a coin', () => {
    render(<LoanTermsForm loan={loan({ owedSymbol: 'BTC', owedQuantity: 0.4, principal: null, startedAt: null, interestTerms: null, interestRate: null })} now={NOW} onDone={() => undefined} />);
    expect(text()).toContain('owed in a coin');
    expect(tree!.root.findAll((n) => n.props.accessibilityLabel === 'Original amount in EUR')).toHaveLength(0);
    expect(radio('Interest', 'Simple')).toBeUndefined();
    expect(radio('Interest', 'Manual')).toBeDefined();
  });
});

describe('helpers', () => {
  it('reads past and later dates typed loosely', () => {
    expect(pastDate('2026-07-01', NOW)).toBe(day(2026, 7, 1));
    expect(pastDate('2027-03-01', NOW)).toBeNull();
    expect(laterDate('2026-12-20', NOW)).toBe(day(2026, 12, 20));
    expect(laterDate('2026-02-31', NOW)).toBeNull();
  });
  it('knows whether a debt has terms', () => {
    expect(hasTerms(loan())).toBe(true);
    expect(hasTerms(loan({ principal: null, startedAt: null, dueKind: null, interestTerms: null }))).toBe(false);
  });
});
