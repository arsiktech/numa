import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { withInvested, type Summary } from '@/domain/summary';
import { LiquidBreakdown } from './LiquidBreakdown';

let mockHidden = false;
jest.mock('./money', () => {
  const { formatMoney: format } = jest.requireActual('@/domain/money');
  return { useMoney: () => ({ money: (cents: number) => (mockHidden ? '€•••' : format(cents)), hidden: mockHidden }) };
});
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { ink: '#fff', ink2: '#aaa', ink3: '#777', down: '#f55', line2: '#444' } }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const summary = (liquidCents: number, oweCents: number) => ({ liquidCents, oweCents, liquidAfterDebtsCents: liquidCents - oweCents, investedCents: 0 }) as Summary;

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; mockHidden = false; });

const textOf = (t: TestRenderer.ReactTestRenderer) => JSON.stringify(t.toJSON());
const labelOf = (t: TestRenderer.ReactTestRenderer) => t.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Liquid after debts'))[0].props.accessibilityLabel as string;

test('shows liquid assets, what is owed, and the result', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(1_250_000, 420_000)} pledged={null} />); });
  const text = textOf(tree!);
  expect(text).toContain('Liquid assets');
  expect(text).toContain('€12,500');
  expect(text).toContain('What you owe');
  expect(text).toContain('−€4,200');
  expect(text).toContain('Liquid after debts');
  expect(text).toContain('€8,300');
  expect(labelOf(tree!)).toBe('Liquid after debts. Liquid assets €12,500, minus what you owe €4,200, leaves €8,300.');
});

test('shows a negative result as negative and says why', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(100_000, 450_000)} pledged={null} />); });
  const text = textOf(tree!);
  expect(text).toContain('−€3,500');
  expect(text).toContain('more than you could turn into cash within a week');
});

test('shows zero owed without a minus sign or a warning', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(100_000, 0)} pledged={null} />); });
  const text = textOf(tree!);
  expect(text).not.toContain('−');
  expect(text).not.toContain('more than you could turn into cash');
});

test('says how much of the debt is backed by collateral, and when that may be low', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(1_000_000, 500_000)} pledged={{ cents: 320_000, partial: false }} />); });
  expect(textOf(tree!)).toContain('€3,200');
  expect(textOf(tree!)).toContain('is backed by collateral');
  expect(textOf(tree!)).not.toContain('may be low');
  act(() => tree!.update(<LiquidBreakdown summary={summary(1_000_000, 500_000)} pledged={{ cents: 320_000, partial: true }} />));
  expect(textOf(tree!)).toContain('may be low');
});

test('leaves the collateral line out when nothing is backed', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(1_000_000, 500_000)} pledged={{ cents: 0, partial: false }} />); });
  expect(textOf(tree!)).not.toContain('backed by collateral');
});

test('hides amounts from the spoken label when amounts are hidden', () => {
  mockHidden = true;
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(1_250_000, 420_000)} pledged={null} />); });
  expect(labelOf(tree!)).toBe('Liquid after debts. Amounts hidden.');
  expect(textOf(tree!)).not.toContain('12,500');
});

test('leaves out money a loan put into a company, and says it is still owed', () => {
  // 2,681.10 liquid, 4,854.21 owed, 2,000 of it went into the company.
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={withInvested(summary(268_110, 485_421), 200_000)} pledged={null} invested={{ cents: 200_000, partial: false, linked: true }} />); });
  const text = textOf(tree!);
  expect(text).toContain('−€4,854');
  expect(text).toContain('Went into things you can’t sell this week');
  expect(text).toContain('€2,000');
  expect(text).toContain('−€173');
  expect(text).toContain('It is still owed');
  expect(text).not.toContain('pick where it went');
  expect(labelOf(tree!)).toBe('Liquid after debts. Liquid assets €2,681, minus what you owe €4,854, except €2,000 that went into things you can’t sell within a week, leaves −€173.');
});

test('says how to leave out a loan put into a company when no loan says where its money went', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(268_110, 485_421)} pledged={null} invested={{ cents: 0, partial: false, linked: false }} />); });
  expect(textOf(tree!)).toContain('pick where it went on the loan’s page');
  expect(textOf(tree!)).not.toContain('Went into things');
  act(() => tree!.update(<LiquidBreakdown summary={summary(268_110, 485_421)} pledged={null} invested={{ cents: 0, partial: false, linked: true }} />));
  expect(textOf(tree!)).not.toContain('pick where it went');
});

test('lets text grow with the user’s text size instead of clipping', () => {
  act(() => { tree = TestRenderer.create(<LiquidBreakdown summary={summary(1_250_000, 420_000)} pledged={{ cents: 1, partial: false }} />); });
  const texts = tree!.root.findAll((n) => typeof n.props.maxFontSizeMultiplier === 'number');
  expect(texts.length).toBeGreaterThan(0);
  expect(Math.min(...texts.map((n) => n.props.maxFontSizeMultiplier as number))).toBeGreaterThanOrEqual(1.4);
});
