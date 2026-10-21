import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';

import AskScreen from '@/app/ask';
import { CoachTip } from '@/ui/CoachTip';

jest.mock('expo-router', () => ({ router: { canGoBack: () => false, replace: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/cloud/session', () => ({ useSession: () => ({ kind: 'signedOut' }) }));
jest.mock('@/ask/useAskSource', () => ({ useDemoAskSource: () => ({ status: 'loading' }), useCloudAskSource: () => ({ status: 'loading' }) }));
jest.mock('@/ask/DraftCard', () => ({ DraftCard: () => null }));
jest.mock('@/privacy/AISharingPanel', () => ({ AISharingPanel: () => null, AISharingActions: () => null }));
jest.mock('@/ui/Panel', () => ({ PanelFrame: ({ children }: { children: unknown }) => children }));
jest.mock('@/ui/money', () => ({ useMoney: () => ({ mask: (text: string) => text }) }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { bg: '#000000', ink: '#ffffff', ink2: '#aaaaaa', ink3: '#777777', s1: '#111111', line: '#333333', line2: '#444444', glassBorder: '#555555' } }) }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useReducedMotion: () => true,
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: () => ({}),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; });

test('the rendered Send control grows with its text instead of clipping accessibility sizes', () => {
  act(() => { tree = TestRenderer.create(<AskScreen />); });
  const send = tree!.root.findByProps({ testID: 'ask-send' });
  const style = StyleSheet.flatten(send.props.style);
  expect(style.height).toBeUndefined();
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
  expect(style.paddingVertical).toBeGreaterThanOrEqual(8);
  expect(send.props.accessibilityLabel).toBe('Send');
});

test('a coach tip keeps its dismissal inside an intrinsically sized touch container', () => {
  act(() => { tree = TestRenderer.create(<CoachTip title="A longer first-visit explanation" body="The explanation may wrap at larger text sizes." onDismiss={jest.fn()} top={70} width={320} />); });
  const views = tree!.root.findAllByType(View);
  const container = StyleSheet.flatten(views[0].props.style);
  expect(container.height).toBeUndefined();
  expect(container.top).toBe(70);
  const card = views.find((view) => view.props.accessibilityRole === 'alert');
  expect(card).toBeDefined();
  expect(StyleSheet.flatten(card!.props.style).position).not.toBe('absolute');
});


function renderBoundedTip(height: number, top = 85) {
  const bounds = { availableHeight: height };
  act(() => { tree = TestRenderer.create(<CoachTip {...bounds} title="Drag the line to go back in time" body="Let go to stay on that date, then tap a block to see what was in it." onDismiss={jest.fn()} top={top} width={402} />); });
}

function reportTipHeight(height: number) {
  const card = tree!.root.findAllByType(View).find((view) => view.props.accessibilityRole === 'alert')!;
  act(() => { card.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } }); });
}

function tipContainerTop() {
  return StyleSheet.flatten(tree!.root.findAllByType(View)[0].props.style).top as number;
}

test('a taller measured coach tip stays above the adjacent chart range controls', () => {
  const plotHeight = 190, cardHeight = 146;
  renderBoundedTip(plotHeight);
  reportTipHeight(cardHeight);
  expect(tipContainerTop() + cardHeight).toBeLessThanOrEqual(plotHeight);
  expect(StyleSheet.flatten(tree!.root.findAllByType(View)[0].props.style).height).toBeUndefined();
});

test('a compact measured coach tip keeps its preferred chart anchor', () => {
  renderBoundedTip(190);
  reportTipHeight(80);
  expect(tipContainerTop()).toBe(85);
});

test('coach-tip anchoring recovers after a layout height change', () => {
  const plotHeight = 190, cardHeight = 146;
  renderBoundedTip(plotHeight);
  reportTipHeight(cardHeight);
  expect(tipContainerTop() + cardHeight).toBeLessThanOrEqual(plotHeight);
  reportTipHeight(80);
  expect(tipContainerTop()).toBe(85);
});
