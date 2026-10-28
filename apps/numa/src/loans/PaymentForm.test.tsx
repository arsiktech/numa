import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import type { CloudLiability } from '@/cloud/api';
import type { DebtEvent, Party } from '@/data/moneyMap';
import { PaymentForm, type NewEvent } from './PaymentForm';
import { simulateZone } from './testZone';

let mockCounter = 0;
jest.mock('@/data/cloud', () => ({ newMutationId: (prefix: string) => `${prefix}:${++mockCounter}` }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { bg: '#000', ink: '#fff', ink2: '#aaa', ink3: '#777', s1: '#111', s2: '#222', line2: '#444', down: '#f55', warn: '#fa0' } }) }));
jest.mock('@/theme/webFont', () => ({ webFont: (f: string) => f }));
jest.mock('@/ui/PositionRow', () => ({ amountText: (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Math.round(n * 1e8) / 1e8)) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const NOW = day(2026, 10, 24);

const liability = (over: Partial<CloudLiability> = {}): CloudLiability => ({
  id: 'l1', name: 'Loan from Sam', kind: 'loan', balance: 20_000, currency: 'EUR', dueDate: null, updatedAt: 0,
  principal: 20_000, startedAt: day(2026, 7, 1), dueKind: 'flexible', interestTerms: 'simple', interestRate: 8, ...over,
} as CloudLiability);

const party = (loan: CloudLiability, unit = loan.owedSymbol || loan.currency): Party => ({
  key: 'by:sam', name: 'Sam', kind: 'person', owed: 'byYou', cents: 2_000_000, unknown: 0, detail: '',
  records: [{ subject: `liability:${loan.id}`, name: loan.name, amount: '€20,000', cents: 2_000_000, unit, open: { pathname: '/loan/[key]', params: { key: 'x' } }, since: null, loan }],
});
const lentParty: Party = {
  key: 'to:co', name: 'Company', kind: 'person', owed: 'toYou', cents: 5_000_000, unknown: 0, detail: '',
  records: [{ subject: 'asset:a1', name: 'Loan to the company', amount: '€50,000', cents: 5_000_000, unit: 'EUR', open: { pathname: '/loan/[key]', params: { key: 'y' } }, since: null }],
};

const event = (over: Partial<DebtEvent>): DebtEvent => ({ id: 'e', subject: 'liability:l1', kind: 'repaid', amount: null, unit: 'EUR', applied: true, occurredAt: day(2026, 8, 15), note: null, ...over });

/** What the form handed to onSave on its n-th call. */
const sentBy = (fn: jest.Mock, n: number) => (fn.mock.calls[n] as unknown as [NewEvent])[0];

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { jest.restoreAllMocks(); if (tree) act(() => tree?.unmount()); tree = undefined; mockCounter = 0; });

type Json = TestRenderer.ReactTestRendererJSON | string;
const flat = (n: Json | Json[] | null): string => (n === null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : (n.children ?? []).map(flat).join(''));
const text = () => flat(tree!.toJSON() as Json | Json[] | null);
const textIn = (i: TestRenderer.ReactTestInstance): string => i.children.map((c) => (typeof c === 'string' ? c : textIn(c))).join('');

const render = (p: Party, onSave: (e: NewEvent) => Promise<unknown> | void, events: DebtEvent[] = [], now = NOW) => {
  act(() => { tree = TestRenderer.create(<PaymentForm party={p} events={events} now={now} onSave={onSave} onCancel={() => undefined} />); });
};
const field = (label: string | RegExp) => tree!.root.findAll((n) => typeof n.props.onChangeText === 'function' && (typeof label === 'string' ? n.props.accessibilityLabel === label : label.test(String(n.props.accessibilityLabel))))[0];
const type = (label: string | RegExp, value: string) => act(() => field(label).props.onChangeText(value));
const save = () => tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && textIn(n) === 'Save')[0];
const pressSave = async () => { await act(async () => { await save().props.onPress(); }); };
const radio = (group: string, label: string) => tree!.root.findAll((n) => n.props.accessibilityLabel === group && n.props.accessibilityRole === 'radiogroup')[0]
  .findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && textIn(n) === label)[0];
const toggle = (label: string) => tree!.root.findAll((n) => n.props.accessibilityRole === 'switch' && typeof n.props.onPress === 'function' && textIn(n).includes(label))[0];

describe('saving once', () => {
  it('records a second tap while the first save is still on its way as nothing', async () => {
    let finish: (v: boolean) => void = () => undefined;
    const onSave = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    render(party(liability()), onSave);
    type('Amount in EUR', '500');
    // Two taps in the same moment, before the screen has redrawn.
    await act(async () => { const press = save().props.onPress; press(); press(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(save().props.disabled).toBe(true);
    await act(async () => { finish(true); });
    expect(save().props.disabled).toBe(false);
  });

  it('sends the same request id for the same inputs, so a retry counts once, and a new one after a change', async () => {
    const onSave = jest.fn(async () => false);
    render(party(liability()), onSave);
    type('Amount in EUR', '500');
    await pressSave();
    await pressSave();
    expect(sentBy(onSave, 0).clientMutationId).toBe(sentBy(onSave, 1).clientMutationId);
    type('Amount in EUR', '600');
    await pressSave();
    expect(sentBy(onSave, 2).clientMutationId).not.toBe(sentBy(onSave, 0).clientMutationId);
  });

  it('sends the first id again after editing and changing back, so retyping the same payment counts once', async () => {
    const onSave = jest.fn(async () => false);
    render(party(liability()), onSave);
    type('Amount in EUR', '500');
    await pressSave();
    type('Amount in EUR', '600');
    type('Amount in EUR', '500');
    await pressSave();
    expect(sentBy(onSave, 1).clientMutationId).toBe(sentBy(onSave, 0).clientMutationId);
  });
});

describe('what is sent', () => {
  it('saves a plain payment as before: the whole amount, no parts', async () => {
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave);
    type('Amount in EUR', '5,000');
    type(/^Note/, 'Paid via Zen');
    await pressSave();
    const sent = sentBy(onSave, 0);
    expect(sent).toMatchObject({ subject: 'liability:l1', kind: 'repaid', amount: 5_000, unit: 'EUR', apply: true, note: 'Paid via Zen' });
    expect(sent.principalPart).toBeUndefined();
  });

  it('splits a payment, the rest becoming the principal, and reads decimal commas', async () => {
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave);
    act(() => toggle('Split into principal').props.onPress());
    type('Total payment in EUR', '1234,50');
    type('Interest', '34,50');
    expect(text()).toContain('the rest, €1,200');
    await pressSave();
    expect(sentBy(onSave, 0)).toMatchObject({ amount: 1_234.5, principalPart: 1_200, interestPart: 34.5, feePart: 0 });
  });

  it('names parts that do not add up and will not save them', async () => {
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave);
    act(() => toggle('Split into principal').props.onPress());
    type('Total payment in EUR', '1000');
    type('Interest', '150');
    type('Fees', '50');
    type(/^Principal/, '900');
    expect(text()).toContain('The parts are 100.00 more than the payment.');
    expect(save().props.disabled).toBe(true);
    await pressSave();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('compares a coin split in eight decimals, as the server does', async () => {
    const eth = liability({ owedSymbol: 'ETH', owedQuantity: 3, balance: 9_000, currency: 'USD', principal: null, startedAt: null, interestTerms: null, interestRate: null, dueKind: null });
    const onSave = jest.fn(async () => true);
    render(party(eth), onSave);
    act(() => toggle('Split into principal').props.onPress());
    type('Total payment in ETH', '0.12345678');
    type('Interest', '0.02345678');
    expect(text()).not.toContain('more than the payment');
    await pressSave();
    expect(sentBy(onSave, 0)).toMatchObject({ amount: 0.12345678, unit: 'ETH', principalPart: 0.1, interestPart: 0.02345678 });
  });

  it('refuses a coin split that only adds up to the cent', () => {
    const eth = liability({ owedSymbol: 'ETH', owedQuantity: 3, balance: 9_000, currency: 'USD', principal: null, startedAt: null, interestTerms: null, interestRate: null, dueKind: null });
    render(party(eth), async () => true);
    act(() => toggle('Split into principal').props.onPress());
    type('Total payment in ETH', '1');
    type('Interest', '0.004');
    type(/^Principal/, '1');
    expect(text()).toContain('The parts are 0.00400000 more than the payment.');
    expect(save().props.disabled).toBe(true);
  });

  it('turns a typed day into the same calendar day at noon UTC, however it was typed', async () => {
    const onSave = jest.fn(async () => false);
    render(party(liability()), onSave);
    type('Amount in EUR', '100');
    type(/^When/, '2026-02-10');
    await pressSave();
    type(/^When/, 'today');
    await pressSave();
    const local = new Date(NOW);
    expect(sentBy(onSave, 0).occurredAt).toBe(Date.UTC(2026, 1, 10, 12));
    expect(sentBy(onSave, 1).occurredAt).toBe(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), 12));
  });

  it('sends a note without an amount, and a history-only payment as not applied', async () => {
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave);
    type('Amount in EUR', '100');
    act(() => toggle('Change what I owe').props.onPress());
    await pressSave();
    expect(sentBy(onSave, 0)).toMatchObject({ kind: 'repaid', amount: 100, apply: false });
    act(() => radio('What happened', 'Note').props.onPress());
    type('Note', 'Agreed to pay the rest in December');
    await pressSave();
    const note = sentBy(onSave, 1);
    expect(note).toMatchObject({ kind: 'note', apply: false, note: 'Agreed to pay the rest in December' });
    expect(note.amount).toBeUndefined();
  });

  it('records money lent to you the same way, with no interest to add', async () => {
    const onSave = jest.fn(async () => true);
    render(lentParty, onSave);
    expect(radio('What happened', 'Got back')).toBeDefined();
    expect(radio('What happened', 'Interest added')).toBeUndefined();
    type('Amount in EUR', '1000');
    await pressSave();
    expect(sentBy(onSave, 0)).toMatchObject({ subject: 'asset:a1', kind: 'received', amount: 1_000 });
  });
});

describe('adding interest to the loan', () => {
  it.each(['USD', 'BTC', null])('does not offer capitalization for unsupported %s history even when raw numbers reconcile', (unit) => {
    render(party(liability()), jest.fn());
    expect(radio('What happened', 'Interest added')).toBeDefined();
    const history = [event({ amount: 100, unit })];
    act(() => tree!.update(<PaymentForm party={party(liability({ balance: 19_900 }))} events={history} now={NOW} onSave={jest.fn()} onCancel={() => undefined} />));
    expect(radio('What happened', 'Interest added')).toBeUndefined();
    expect(text()).toContain('Interest cannot be worked out');
    expect(text()).not.toContain('Interest owed so far: €0');
  });
  const openCapitalize = () => act(() => radio('What happened', 'Interest added').props.onPress());

  it('is offered only when the terms say how interest accrues, the history agrees with the balance, and some is owed', () => {
    render(party(liability()), async () => true);
    expect(radio('What happened', 'Interest added')).toBeDefined();
    act(() => tree!.update(<PaymentForm party={party(liability({ interestTerms: null, interestRate: null, principal: null, startedAt: null }))} events={[]} now={NOW} onSave={async () => true} onCancel={() => undefined} />));
    expect(radio('What happened', 'Interest added')).toBeUndefined();
    act(() => tree!.update(<PaymentForm party={party(liability({ interestTerms: 'manual', interestRate: null }))} events={[]} now={NOW} onSave={async () => true} onCancel={() => undefined} />));
    expect(radio('What happened', 'Interest added')).toBeUndefined();
  });

  it('is not offered when the history and the balance disagree, and says why', () => {
    render(party(liability({ balance: 18_000 })), async () => true);
    expect(radio('What happened', 'Interest added')).toBeUndefined();
    expect(text()).toContain('history and the balance of this debt disagree');
  });

  it('is not offered once the interest owed has been added', () => {
    const added = [event({ kind: 'capitalized', amount: 399.99, occurredAt: day(2026, 10, 2) })];
    render(party(liability({ balance: 20_399.99 })), async () => true, added);
    expect(radio('What happened', 'Interest added')).toBeUndefined();
  });

  it('offers the interest owed, and refuses to add more than that', async () => {
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave);
    openCapitalize();
    expect(text()).toContain('Interest owed so far: €399.99');
    type('Interest to add in EUR', '5000');
    expect(text()).toContain('more than the interest owed so far');
    expect(save().props.disabled).toBe(true);
    type('Interest to add in EUR', '');
    const use = tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && textIn(n).startsWith('Use €'))[0];
    act(() => use.props.onPress());
    await pressSave();
    expect(sentBy(onSave, 0)).toMatchObject({ kind: 'capitalized', amount: 399.99, unit: 'EUR', apply: true });
  });

  it('rounds what you type to cents before checking it, as the server stores it', () => {
    render(party(liability()), async () => true);
    openCapitalize();
    // 399.995 is stored as 400.00, a cent more than is owed.
    type('Interest to add in EUR', '399.995');
    expect(text()).toContain('more than the interest owed so far, €399.99');
    expect(save().props.disabled).toBe(true);
  });

  it('caps interest added on an earlier date at what was owed on that date', async () => {
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave);
    openCapitalize();
    type(/^When/, '2026-08-20');
    // Only the month to 1 Aug had completed by 20 Aug.
    expect(text()).toContain('Interest that can be added on that date: €133.33');
    type('Interest to add in EUR', '200');
    expect(text()).toContain('more than the interest that can be added on that date, €133.33');
    expect(save().props.disabled).toBe(true);
    type('Interest to add in EUR', '');
    act(() => tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && textIn(n) === 'Use €133.33')[0].props.onPress());
    await pressSave();
    expect(sentBy(onSave, 0)).toMatchObject({ kind: 'capitalized', amount: 133.33, occurredAt: day(2026, 8, 20) });
  });

  it('does not add back-dated interest again once it has been paid since', () => {
    // 300 of interest paid on 5 Oct leaves 99.99 owed today, though 266.66 was owed on 20 Sep.
    const paid = [event({ kind: 'repaid', amount: 300, principalPart: 0, interestPart: 300, feePart: 0, occurredAt: day(2026, 10, 5) })];
    render(party(liability()), async () => true, paid);
    openCapitalize();
    type(/^When/, '2026-09-20');
    expect(text()).toContain('Interest that can be added on that date: €99.99');
    type('Interest to add in EUR', '266.66');
    expect(text()).toContain('more than the interest that can be added on that date, €99.99');
    expect(save().props.disabled).toBe(true);
  });

  it('falls back to a payment when the interest it was set to add is no longer offered', () => {
    render(party(liability()), async () => true);
    openCapitalize();
    act(() => tree!.update(<PaymentForm party={party(liability({ balance: 18_000 }))} events={[]} now={NOW} onSave={async () => true} onCancel={() => undefined} />));
    expect(text()).toContain('Amount in EUR');
    expect(text()).not.toContain('Interest to add');
  });
});

describe('a phone whose date is ahead of UTC', () => {
  // 00:30 on 25 Oct at UTC+2 is 22:30 on 24 Oct in UTC. A payment typed as "today" is dated the 25th.
  const clock = Date.UTC(2026, 9, 24, 22, 30);
  const paidToday = [event({ amount: 1_000, kind: 'repaid', occurredAt: day(2026, 10, 25) })];

  it('still offers Interest added, and does not say the history disagrees, after a payment dated today', () => {
    simulateZone(2);
    render(party(liability({ balance: 19_000 })), jest.fn(), paidToday, clock);
    expect(text()).toContain('Interest added');
    expect(text()).not.toContain('disagree');
  });

  it('dates a new payment typed as today on the phone’s own date, and lets it be saved', async () => {
    simulateZone(2);
    const onSave = jest.fn(async () => true);
    render(party(liability()), onSave, [], clock);
    type('Amount in EUR', '500');
    await pressSave();
    expect(sentBy(onSave, 0).occurredAt).toBe(day(2026, 10, 25));
  });
});
