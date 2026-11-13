import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePrefs } from '@/state/prefs';
import { ThemeProvider } from '@/theme/theme';
import { FitLine, scaleType } from './FitLine';
import { LensBar, type BarEntry } from './LensBar';
import { CurrencyScope } from './money';
import { PressableLink } from './PressableLink';
import { Txt } from './Txt';

jest.mock('@/state/prefs', () => ({ usePrefs: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
  useAnimatedStyle: (updater: () => object) => updater(),
  useReducedMotion: () => true,
  useSharedValue: (value: number) => ({ get: () => value, set: () => undefined }),
  withTiming: (value: number) => value,
}));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('./useLensInteraction', () => ({
  useLensInteraction: () => ({ gesture: {}, selected: -1, inspecting: false, inspect: jest.fn(), dismiss: jest.fn(), canOpen: () => true }),
  useLensGeometry: () => ({ get: () => [] }),
}));
// What `Link asChild` does to its child: the link's props land on it, and the two `style` props are
// merged as objects. A style function does not survive that merge.
jest.mock('expo-router', () => {
  const { cloneElement } = jest.requireActual<typeof import('react')>('react');
  return { Link: ({ children, href }: { children: React.ReactElement<{ style?: object }>; href: string }) => cloneElement(children, { href, style: { ...children.props.style } } as object) };
});

let tree: ReactTestRenderer;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
beforeAll(() => { previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT; actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); });
const layout = (width: number) => ({ nativeEvent: { layout: { width } } });

describe('block labels', () => {
  const entries: BarEntry[] = [
    { id: 'wide', name: 'Crypto', cents: 92_000_00, fill: '#111111', ink: '#ffffff' },
    { id: 'narrow', name: 'Debts', cents: 8_000_00, fill: '#222222', ink: '#ffffff' },
  ];
  it('labels a block whose amount fits whole and leaves a narrower one plain', async () => {
    jest.mocked(usePrefs).mockReturnValue({ hideAmounts: false, theme: 'dark', set: jest.fn() } as unknown as ReturnType<typeof usePrefs>);
    await act(async () => { tree = create(<ThemeProvider><CurrencyScope currency="EUR"><LensBar entries={entries} height={60} emptyColor="#000000" /></CurrencyScope></ThemeProvider>); });
    const surface = tree.root.findAllByType(View).find((v) => v.props.testID === 'bar-lens-surface')!;
    // A phone: the 8% block is about 28 px wide, too narrow for "€8k" and its padding.
    await act(async () => { surface.props.onLayout(layout(350)); });
    const names = () => tree.root.findAllByType(Txt).map((t) => t.props.children);
    expect(names()).toContain('Crypto');
    expect(names()).not.toContain('Debts');
    // The same share on a wide screen has the room, and gets its label.
    await act(async () => { surface.props.onLayout(layout(900)); });
    expect(names()).toContain('Debts');
    // Both stay reachable either way: each block keeps its own control.
    expect(tree.root.findAll((n) => typeof n.props.onPress === 'function' && /^(Crypto|Debts), /.test(n.props.accessibilityLabel ?? '')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('FitLine', () => {
  it('shrinks a line that is wider than its room, and holds that size once it fits', async () => {
    const seen: number[] = [];
    await act(async () => { tree = create(<FitLine>{(k) => { seen.push(k); return <View testID="figure" />; }}</FitLine>); });
    const rows = () => tree.root.findAllByType(View).filter((v) => typeof v.props.onLayout === 'function');
    expect(seen.at(-1)).toBe(1);
    await act(async () => { rows()[0].props.onLayout(layout(280)); });
    await act(async () => { rows()[1].props.onLayout(layout(360)); });
    expect(seen.at(-1)).toBeCloseTo(280 / 360);
    // Drawn at that scale the content measures 280; that is still a 360-wide line at full size.
    await act(async () => { rows()[1].props.onLayout(layout(280)); });
    expect(seen.at(-1)).toBeCloseTo(280 / 360);
    // More room: back to full size.
    await act(async () => { rows()[0].props.onLayout(layout(400)); });
    expect(seen.at(-1)).toBe(1);
  });
  it('never goes below the floor', async () => {
    const seen: number[] = [];
    await act(async () => { tree = create(<FitLine min={0.5}>{(k) => { seen.push(k); return <View />; }}</FitLine>); });
    const rows = () => tree.root.findAllByType(View).filter((v) => typeof v.props.onLayout === 'function');
    await act(async () => { rows()[0].props.onLayout(layout(100)); });
    await act(async () => { rows()[1].props.onLayout(layout(900)); });
    expect(seen.at(-1)).toBe(0.5);
  });
  it('scales a text style as a whole', () => {
    expect(scaleType({ fontSize: 40, lineHeight: 46, letterSpacing: -1 }, 0.5)).toEqual({ fontSize: 20, lineHeight: 23, letterSpacing: -0.5 });
    expect(scaleType({ fontSize: 40, lineHeight: 46 }, 1)).toEqual({ fontSize: 40, lineHeight: 46 });
  });
});

describe('PressableLink', () => {
  it('keeps its look when the link merges styles into it', async () => {
    const look = (pressed: boolean) => ({ minHeight: 48, backgroundColor: '#ffffff', opacity: pressed ? 0.72 : 1 });
    await act(async () => { tree = create(<PressableLink href="/" look={look}><View /></PressableLink>); });
    // React 19 unwraps the memoized Pressable, so the control is found by what it carries.
    const control = tree.root.findAll((n) => typeof n.props.style === 'function' && n.props.accessibilityRole === 'link')[0];
    expect(control.props.accessibilityRole).toBe('link');
    expect(control.props.href).toBe('/');
    expect(control.props.style({ pressed: false })).toEqual(look(false));
    expect(control.props.style({ pressed: true })).toEqual(look(true));
  });
});
