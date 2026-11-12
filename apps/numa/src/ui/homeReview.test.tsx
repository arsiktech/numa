import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { usePrefs } from '@/state/prefs';
import { ThemeProvider } from '@/theme/theme';
import { LensBar } from './LensBar';
import { CurrencyScope } from './money';
import { TeaserCard } from './TeaserCard';
import { Txt } from './Txt';

jest.mock('@/state/prefs', () => ({ usePrefs: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
  useAnimatedStyle: (updater: () => object) => updater(),
  useReducedMotion: () => true,
  useSharedValue: (v: number) => ({ get: () => v, set: () => undefined }),
  withTiming: (v: number) => v,
}));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('./useLensInteraction', () => ({
  useLensInteraction: () => ({ gesture: {}, selected: 0, inspecting: false, inspect: jest.fn(), dismiss: jest.fn(), canOpen: () => true }),
  useLensGeometry: () => ({ get: () => [] }),
}));
jest.mock('expo-router', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Link: ({ href, children }: { href: string; children: React.ReactNode }) => <RNView testID="link" {...{ href }}>{children}</RNView> };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: ReactTestRenderer;
const wrap = (node: React.ReactNode) => {
  jest.mocked(usePrefs).mockReturnValue({ hideAmounts: false, theme: 'dark', set: jest.fn() } as unknown as ReturnType<typeof usePrefs>);
  return <ThemeProvider><CurrencyScope currency="EUR">{node}</CurrencyScope></ThemeProvider>;
};
const byTestId = (id: string) => tree.root.findAllByType(View).find((v) => v.props.testID === id)!;
const ancestors = (node: ReactTestInstance) => { const out: ReactTestInstance[] = []; for (let p = node.parent; p; p = p.parent) out.push(p); return out; };
afterEach(() => act(() => tree.unmount()));

test('a short bar draws at its share while its readout keeps the full row', () => {
  act(() => { tree = create(wrap(<LensBar share={0.1} height={56} labelMin={0.1} emptyColor="#000"
    entries={[{ id: 'crypto', name: 'Crypto', cents: 1_000_000, fill: '#111', ink: '#fff', detail: 'Example coin €10k' }]} />)); });
  const surface = byTestId('bar-lens-surface');
  expect(StyleSheet.flatten(surface.props.style).width).toBe('10%');
  const readout = byTestId('lens-readout');
  expect(ancestors(readout)).not.toContain(surface);
  expect(ancestors(readout).some((a) => a.type === View && StyleSheet.flatten(a.props.style)?.width !== undefined)).toBe(false);
});

test('a Home card is a real link with an href, so Enter opens it on the web', () => {
  act(() => { tree = create(wrap(<TeaserCard title="October so far" href="/flow" accessibilityLabel="October so far. Open"><Txt>in €1</Txt></TeaserCard>)); });
  const link = byTestId('link');
  expect(link.props.href).toBe('/flow');
  expect(link.findAll((n) => n.props.accessibilityRole === 'link').length).toBeGreaterThan(0);
});
