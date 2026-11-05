import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import type { Attention } from '@/domain/types';
import { NeedsYou } from './NeedsYou';

const mockDismiss = jest.fn();

jest.mock('@/state/prefs', () => ({ usePrefs: () => ({ dismiss: mockDismiss }) }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { bg: '#000', ink: '#fff', ink2: '#aaa', ink3: '#777', s1: '#111', s2: '#222', down: '#f66', warn: '#fc6', upInk: '#3d3' } }) }));
jest.mock('./money', () => ({ useMoney: () => ({ mask: (text: string) => text }) }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  FadeInDown: { delay: () => ({ duration: () => undefined }) },
  useReducedMotion: () => true,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item: Attention = {
  id: 'tax', urgency: 'due', title: 'Pay Q3 taxes by 20 October', body: 'About €2,140.', primary: 'Mark as paid', secondary: 'Estimate', doneText: 'Marked as paid', raisedAt: '2026-10-01T08:00:00Z',
};

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; mockDismiss.mockClear(); });

const press = (name: string) => tree!.root.findAll((node) => node.props.accessibilityRole === 'button' && node.findAll((child) => child.props.children === name).length > 0)[0];

test('a signed-in action runs', () => {
  act(() => { tree = TestRenderer.create(<NeedsYou items={[{ ...item, primary: 'Got it', secondary: 'Later' }]} />); });
  act(() => { press('Got it').props.onPress(); });
  expect(mockDismiss).toHaveBeenCalledWith('tax', { title: item.title, later: false });
});

test('demo actions stay visible and do not run', () => {
  act(() => { tree = TestRenderer.create(<NeedsYou items={[item]} readOnly />); });
  const primary = press('Mark as paid');
  const secondary = press('Estimate');
  expect(primary.props.disabled).toBe(true);
  expect(primary.props['aria-disabled']).toBe(true);
  expect(secondary.props.disabled).toBe(true);
  expect(primary.props.onPress).toBeUndefined();
  act(() => { primary.props.onPress?.(); secondary.props.onPress?.(); });
  expect(mockDismiss).not.toHaveBeenCalled();
});
