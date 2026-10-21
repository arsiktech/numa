import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedReaction, useDerivedValue, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { hitTestOriginal, lensTarget, mixGeometry, packRects } from './lens';
import type { Tile } from './treemapLayout';

/** RN releases carry touch identifiers; RN accessibility clicks do not. RNWeb passes
 * Mouse/PointerEvents (detail > 0 for pointer clicks) or a KeyboardEvent on key release.
 * An accessibility/keyboard click can have detail 0 and an empty pointerType.
 */
function nonPointerActivation(event: { nativeEvent: unknown }): boolean {
  const native = event.nativeEvent;
  if (!native || typeof native !== 'object') return false;
  if ('key' in native || ('type' in native && (native.type === 'keydown' || native.type === 'keyup'))) return true;
  if ('identifier' in native || 'touches' in native || 'changedTouches' in native) return false;
  if ('pointerType' in native && typeof native.pointerType === 'string' && native.pointerType.length > 0) return false;
  if ('detail' in native && typeof native.detail === 'number') return native.detail === 0;
  return true;
}

/** Only selection and gesture start/end cross to React; geometry stays on the UI thread. */
export function useLensInteraction(rects: Tile[], width: number, height: number, resetKey: string, count = rects.length) {
  const focus = useSharedValue(-1);
  const active = useSharedValue(false);
  const dragged = useSharedValue(false);
  const owner = useSharedValue(0);
  const [selection, setSelection] = useState({ key: resetKey, index: -1, inspecting: false });
  const lastTick = useRef(0);
  const notify = useCallback((index: number, inspecting: boolean, changed: boolean) => {
    setSelection({ key: resetKey, index, inspecting });
    if (changed && index >= 0 && Platform.OS !== 'web' && Date.now() - lastTick.current >= 35) {
      lastTick.current = Date.now();
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [resetKey]);
  useEffect(() => {
    focus.set(-1);
    active.set(false);
    owner.set(0);
    dragged.set(false);
  }, [resetKey, focus, active, owner, dragged]);
  useAnimatedReaction(() => ({ index: focus.get(), inspecting: active.get() }), (next, previous) => {
    const changed = next.index !== previous?.index;
    if (changed || next.inspecting !== previous?.inspecting) runOnJS(notify)(next.index, next.inspecting, changed);
  }, [notify]);

  const move = (x: number, y: number) => {
    'worklet';
    focus.set(hitTestOriginal(rects, width, height, x, y));
  };
  const sideways = Gesture.Pan().maxPointers(1).activeOffsetX([-7, 7]).failOffsetY([-10, 10])
    .onTouchesDown(() => { dragged.set(false); })
    .onStart((e) => { owner.set(1); active.set(true); dragged.set(true); move(e.x, e.y); })
    .onUpdate((e) => move(e.x, e.y))
    .onFinalize(() => { if (owner.get() === 1) { active.set(false); owner.set(0); } });
  // Before the hold activates, moving away fails it and leaves the page free to scroll.
  const held = Gesture.Pan().maxPointers(1).activateAfterLongPress(320)
    .onTouchesDown(() => { dragged.set(false); })
    .onStart((e) => { owner.set(2); active.set(true); dragged.set(true); move(e.x, e.y); })
    .onUpdate((e) => move(e.x, e.y))
    .onFinalize(() => { if (owner.get() === 2) { active.set(false); owner.set(0); } });
  const inspect = (index: number) => {
    if (index >= 0 && index < count) {
      focus.set(index);
      setSelection({ key: resetKey, index, inspecting: false });
    }
  };
  return {
    gesture: Gesture.Race(sideways, held), focus, active, resetKey,
    selected: selection.key === resetKey ? selection.index : -1,
    inspecting: selection.key === resetKey && selection.inspecting,
    inspect,
    dismiss: () => {
      focus.set(-1);
      setSelection({ key: resetKey, index: -1, inspecting: false });
    },
    // Retain suppression for this pointer gesture's trailing click. Focus/inspection
    // must not clear it, but later accessibility/key activation needs no new touch.
    canOpen: (event: { nativeEvent: unknown }) => !active.get() && (nonPointerActivation(event) || !dragged.get()),
  };
}

export function useLensGeometry(rects: Tile[], width: number, height: number, kind: 'bar' | 'map', interaction: ReturnType<typeof useLensInteraction>) {
  const reduce = useReducedMotion();
  const { focus, active, resetKey } = interaction;
  const from = useSharedValue(packRects(rects));
  const to = useSharedValue(packRects(rects));
  const phase = useSharedValue(1);
  const previousKey = useSharedValue(resetKey);
  useAnimatedReaction(() => ({ focus: focus.get(), active: active.get() }), (state) => {
    const changed = previousKey.get() !== resetKey;
    previousKey.set(resetKey);
    const target = lensTarget(rects, width, height, state.focus, state.active && !changed, reduce, kind);
    const packed = packRects(target);
    const immediate = reduce || changed || from.get().length !== packed.length;
    from.set(immediate ? packed : mixGeometry(from.get(), to.get(), phase.get()));
    to.set(packed);
    phase.set(0);
    phase.set(immediate ? 1 : withSpring(1, { damping: 30, stiffness: 300, overshootClamping: true }));
  }, [rects, width, height, kind, reduce, resetKey]);
  return useDerivedValue(() => mixGeometry(from.get(), to.get(), phase.get()));
}
