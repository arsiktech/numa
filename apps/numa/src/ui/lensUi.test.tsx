import { Platform, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePrefs } from '@/state/prefs';
import { ThemeProvider } from '@/theme/theme';
import { CurrencyScope } from './money';
import { Treemap, type TreemapTile } from './Treemap';
import { Txt } from './Txt';

jest.mock('@/state/prefs', () => ({ usePrefs: jest.fn() }));
// The installed mock's View passthrough and immediate style callback are all this
// fixture needs. Importing its barrel also imports real Worklets initialization.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
  useAnimatedStyle: (updater: () => object) => updater(),
}));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: React.ReactNode }) => children }));
const mockInspect = jest.fn();
const mockDismiss = jest.fn();
let mockCanOpen = true;
let mockSelected = 1;
let mockInspecting = false;
jest.mock('./useLensInteraction', () => ({
  useLensInteraction: () => ({ gesture: {}, selected: mockSelected, inspecting: mockInspecting, inspect: mockInspect, dismiss: mockDismiss, canOpen: () => mockCanOpen }),
  useLensGeometry: () => ({ get: () => [] }),
}));

const longName = 'A synthetic tiny position with its complete long name';
let tree: ReactTestRenderer;
const open = jest.fn();
// React 19 transparently unwraps memoized Pressable; select the event-bearing component by behavior.
const pressables = () => tree.root.findAll((node) => typeof node.props.onPress === 'function');
const tiles: TreemapTile[] = [
  { id: 'large', label: 'Example large position', cents: 50_000, color: 'catAmber' },
  { id: 'tiny', label: longName, cents: 1, color: 'catAmber', detail: 'XTK $12.34 · YTK', a11y: `${longName}, $0.01`, onPress: open },
];
function view(hidden: boolean, shown: TreemapTile[]) {
  jest.mocked(usePrefs).mockReturnValue({ hideAmounts: hidden, theme: 'light', set: jest.fn() } as unknown as ReturnType<typeof usePrefs>);
  return <ThemeProvider><CurrencyScope currency="USD"><Treemap height={190} tiles={shown} /></CurrencyScope></ThemeProvider>;
}
async function render(hidden: boolean, shown = tiles) {
  await act(async () => { tree = create(view(hidden, shown)); });
}
beforeEach(() => { mockCanOpen = true; mockSelected = 1; mockInspecting = false; mockInspect.mockClear(); mockDismiss.mockClear(); open.mockClear(); });
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
beforeAll(() => { previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT; actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); });

describe('lens readout outside tiny rectangles', () => {
  it.each(['web', 'ios', 'android'] as const)('keeps callback-only navigation keyboard-actionable on %s', async (platform) => {
    const os = jest.replaceProperty(Platform, 'OS', platform);
    try {
      await render(false);
      const surface = tree.root.findAllByType(View).find((v) => v.props.testID === 'treemap-lens-surface')!;
      await act(async () => { surface.props.onLayout({ nativeEvent: { layout: { width: 320 } } }); });
      const tile = pressables().find((p) => p.props.accessibilityLabel === `${longName}, $0.01. Open`)!;
      expect(tile).toBeDefined();
      expect(tile.props.accessibilityRole).toBe(platform === 'web' ? 'button' : 'link');
    } finally { os.restore(); }
  });

  it('shows the full focused name, amount, percent and includes line even before a tile can fit text', async () => {
    await render(false);
    const name = tree.root.findAllByType(Txt).find((t) => t.props.children === longName)!;
    expect(name).toBeDefined();
    expect(name.props.numberOfLines).toBeUndefined();
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('$0.01'); expect(rendered).toContain('%');
    expect(rendered).toContain('XTK $12.34 · YTK');
  });
  it('masks both the focused amount and detail/a11y text when amounts are hidden', async () => {
    await render(false);
    await act(async () => { tree.update(view(true, tiles)); });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('$•.••');
    expect(rendered).toContain('XTK $••.•• · YTK');
    expect(rendered).not.toContain('$0.01');
    expect(rendered).not.toContain('$12.34');
  });
  it('offers 44-point browse controls for subpixel and non-navigable tiles', async () => {
    await render(false, tiles.map((tile) => ({ ...tile, onPress: undefined })));
    const next = pressables().find((p) => p.props.accessibilityLabel === 'Inspect next tile')!;
    expect(next.props.style.minWidth).toBe(44); expect(next.props.style.minHeight).toBe(44);
    await act(async () => { next.props.onPress(); });
    expect(mockInspect).toHaveBeenCalledWith(0);
    expect(pressables().some((p) => p.props.accessibilityLabel === `Open ${longName}`)).toBe(false);
  });
  it('keeps quick-tap navigation and suppresses a click after an activated drag', async () => {
    await render(false);
    const measured = tree.root.findAllByType(View).find((v) => v.props.testID === 'treemap-lens-surface')!;
    await act(async () => { measured.props.onLayout({ nativeEvent: { layout: { width: 320 } } }); });
    const tap = pressables().find((p) => p.props.accessibilityLabel === `${longName}, $0.01. Open`)!;
    expect(tap).toBeDefined();
    await act(async () => { tap.props.onPress(); });
    expect(open).toHaveBeenCalledTimes(1);
    mockCanOpen = false;
    await act(async () => { tap.props.onPress(); });
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('adds no readout, tutorial or browse chrome to the resting chart', async () => {
    mockSelected = -1;
    await render(false);
    expect(tree.root.findAllByType(View).some((v) => v.props.testID === 'lens-readout')).toBe(false);
    expect(pressables().some((p) => p.props.accessibilityLabel === 'Inspect next tile')).toBe(false);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Drag sideways or hold to inspect');
    const surface = tree.root.findAllByType(View).find((v) => v.props.testID === 'treemap-lens-surface')!;
    expect(surface.props.style.height).toBe(190);
  });
  it('keeps a bounded overlay outside the clipped surface, disables its touch targets while inspecting and retains details on release', async () => {
    mockInspecting = true;
    await render(false);
    const surface = tree.root.findAllByType(View).find((v) => v.props.testID === 'treemap-lens-surface')!;
    const overlay = tree.root.findAllByType(View).find((v) => v.props.testID === 'lens-readout')!;
    expect(overlay.props.style.position).toBe('absolute');
    expect(overlay.props.style.bottom).toBeGreaterThan(surface.props.style.height);
    expect(overlay.props.style.maxHeight).toBeLessThanOrEqual(176);
    expect(surface.findAllByProps({ testID: 'lens-readout' })).toHaveLength(0);
    expect(overlay.props.pointerEvents).toBe('none');
    mockInspecting = false;
    await act(async () => { tree.update(view(false, tiles)); });
    const retained = tree.root.findAllByType(View).find((v) => v.props.testID === 'lens-readout')!;
    expect(retained.props.pointerEvents).toBe('auto');
    const name = retained.findAllByType(Txt).find((t) => t.props.children === longName)!;
    expect(name).toBeDefined();
    expect(name.props.numberOfLines).toBeUndefined();
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('$0.01'); expect(rendered).toContain('XTK $12.34 · YTK');
    expect(tree.root.findAllByType(View).find((v) => v.props.testID === 'treemap-lens-surface')!.props.style.height).toBe(190);
    const dismiss = pressables().find((p) => p.props.accessibilityLabel === 'Dismiss tile details')!;
    expect(dismiss.props.style.minWidth).toBe(44); expect(dismiss.props.style.minHeight).toBe(44);
    await act(async () => { dismiss.props.onPress(); });
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });
  it('supports keyboard focus and a native accessibility inspect action without opening a link', async () => {
    await render(false);
    const surface = tree.root.findAllByType(View).find((v) => v.props.testID === 'treemap-lens-surface')!;
    await act(async () => { surface.props.onLayout({ nativeEvent: { layout: { width: 320 } } }); });
    const tile = pressables().find((p) => p.props.accessibilityLabel === `${longName}, $0.01. Open`)!;
    await act(async () => { tile.props.onFocus(); });
    expect(mockInspect).toHaveBeenLastCalledWith(1);
    mockInspect.mockClear();
    expect(tile.props.accessibilityActions).toContainEqual({ name: 'inspect', label: 'Inspect details' });
    await act(async () => { tile.props.onAccessibilityAction({ nativeEvent: { actionName: 'inspect' } }); });
    expect(mockInspect).toHaveBeenCalledWith(1);
    expect(open).not.toHaveBeenCalled();
  });
});
