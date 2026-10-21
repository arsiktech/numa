import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/** Width from which the app shows a sidebar and opens details as panels. */
export const WIDE = 1024;

/** True where detail screens open as a side panel instead of replacing the page. */
export function usePanel(): boolean {
  return useWindowDimensions().width >= WIDE;
}

// How many panels are on screen, so the page beside them can make room.
let open = 0;
const listeners = new Set<() => void>();
const setOpen = (n: number) => { open = n; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** True while a panel is open beside the page. */
export const usePanelOpen = () => useSyncExternalStore(subscribe, () => open > 0, () => false);

export const panelWidth = (width: number) => Math.round(Math.min(560, Math.max(420, width * 0.36)));

/**
 * On wide screens a detail screen (a group, an item, a saved date, Settings…) opens as a panel on the
 * right. The sidebar and the page underneath stay in place and keep working; only the panel's own
 * column belongs to it. On phones it is the full screen, as before.
 */
export function PanelFrame({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const row = useRef<View>(null);
  const navigation = useNavigation();
  const wide = width >= WIDE;
  useEffect(() => (wide ? passThrough(row.current as unknown as HTMLElement | null) : undefined), [wide]);
  useEffect(() => { setOpen(open + 1); return () => setOpen(open - 1); }, []);
  // A block tapped on the page replaces the open panel; one tapped inside a panel opens on top of it, so Back returns.
  useEffect(() => {
    if (!wide || Platform.OS !== 'web' || openedFromPanel) return;
    const state = navigation.getState();
    if (!state || state.routes.filter((r) => r.name !== '(tabs)').length < 2) return;
    const routes = state.routes.filter((r, i) => r.name === '(tabs)' || i === state.routes.length - 1);
    navigation.dispatch({ type: 'RESET', payload: { ...state, routes, index: routes.length - 1 } } as never);
  }, [wide, navigation]);
  if (!wide) return <>{children}</>;
  return (
    <View ref={row} style={{ flex: 1, flexDirection: 'row', backgroundColor: 'transparent' }} pointerEvents="box-none">
      <View style={{ flex: 1 }} pointerEvents="none" />
      <View accessibilityRole="none" aria-label="Details" style={{ pointerEvents: 'auto', width: panelWidth(width), height: '100%', backgroundColor: c.bg, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line2, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 32, shadowOffset: { width: -8, height: 0 } }}>
        {children}
      </View>
    </View>
  );
}

let openedFromPanel = false;
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { openedFromPanel = !!(e.target as Element | null)?.closest?.('[aria-label="Details"]'); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openedFromPanel = !!document.activeElement?.closest('[aria-label="Details"]'); }, true);
}

/**
 * The stack draws each screen in a full-window container and hides the screens below it from
 * assistive tech. For a panel, the containers between the panel and the stack let clicks through
 * and the page underneath stays readable, so the sidebar and Home keep working beside the panel.
 * Web only; returns the undo for when the panel closes.
 */
function passThrough(from: HTMLElement | null): (() => void) | undefined {
  if (Platform.OS !== 'web' || !from?.parentElement) return undefined;
  const undo: (() => void)[] = [];
  let el: HTMLElement | null = from;
  while (el && el !== document.body) {
    const before = el.style.pointerEvents;
    const node = el;
    node.style.pointerEvents = 'none';
    undo.push(() => { node.style.pointerEvents = before; });
    const hidden = [...(el.parentElement?.children ?? [])].filter((s) => s !== node && s.getAttribute('aria-hidden') === 'true');
    if (hidden.length) {
      // The navigator owns aria-hidden. Restoring an old 'true' during unmount can hide
      // the destination after its focus update has already made it visible.
      for (const s of hidden) s.removeAttribute('aria-hidden');
      break;
    }
    el = el.parentElement;
  }
  // Without a screen below it (opened by a direct link), leave everything as it was.
  if (!el || el === document.body) { undo.forEach((u) => u()); return undefined; }
  return () => undo.forEach((u) => u());
}

/** Closes every open panel at once, back to the page underneath. */
export function ClosePanels() {
  return (
    <Pressable onPress={() => (router.canDismiss() ? router.dismissAll() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="body" c="ink2" style={{ fontSize: 20 }}>✕</Txt>
    </Pressable>
  );
}
