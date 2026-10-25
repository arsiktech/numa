import 'react-native-gesture-handler/jestSetup';
import { useLayoutEffect } from 'react';
import { Pressable } from 'react-native';
import { PointerType, State, type GestureStateManager, type GestureTouchEvent, type PanGesture } from 'react-native-gesture-handler';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { barRects } from './lens';
import { useLensInteraction } from './useLensInteraction';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
// Replace only the unavailable UI-thread bridge. Shared cells persist through real
// React rerenders and reactions run on changes. The hook, Gesture.Pan/Race builders,
// callbacks, ownership, suppression and React selection state are all real.
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const reactions = new Set<() => void>();
  function useSharedValue<T>(initial: T) {
    const [cell] = React.useState(() => {
      let value = initial;
      return {
        get: () => value,
        set: (next: T) => {
          if (Object.is(value, next)) return;
          value = next;
          [...reactions].forEach((react) => react());
        },
      };
    });
    return cell;
  }
  function useAnimatedReaction<T>(prepare: () => T, react: (next: T, previous: T | null) => void) {
    const prepareRef = React.useRef(prepare), reactRef = React.useRef(react);
    React.useLayoutEffect(() => {
      prepareRef.current = prepare; reactRef.current = react;
    });
    React.useEffect(() => {
      let previous: T | null = null;
      const reaction = () => {
        const next = prepareRef.current(), before = previous;
        previous = next;
        reactRef.current(next, before);
      };
      reactions.add(reaction); reaction();
      return () => { reactions.delete(reaction); };
    }, []);
  }
  return {
    __esModule: true,
    useSharedValue, useAnimatedReaction,
    runOnJS: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => fn,
    setGestureState: jest.fn(),
  };
});

const rects = barRects([100, 100], 60);
const open = jest.fn();
let current: ReturnType<typeof useLensInteraction>;
let tree: ReactTestRenderer;
function Probe({ resetKey = 'synthetic' }: { resetKey?: string }) {
  const interaction = useLensInteraction(rects, 200, 60, resetKey);
  useLayoutEffect(() => { current = interaction; });
  return <Pressable accessibilityLabel="Open synthetic tile" onFocus={() => interaction.inspect(1)}
    onPress={(event) => { if (interaction.canOpen(event)) { interaction.inspect(1); open(); } }} />;
}
const tile = () => tree.root.findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Open synthetic tile')[0];
const pans = () => current.gesture.toGestureArray() as PanGesture[];
type PanEvent = Parameters<NonNullable<PanGesture['handlers']['onStart']>>[0];
const event = (state: PanEvent['state'], x = 20): PanEvent => ({
  handlerTag: 0, state, oldState: State.BEGAN, pointerType: PointerType.TOUCH, numberOfPointers: 1,
  x, y: 20, absoluteX: x, absoluteY: 20, translationX: x, translationY: 0, velocityX: 0, velocityY: 0,
});
const down: GestureTouchEvent = {
  handlerTag: 0, numberOfTouches: 1, state: State.BEGAN, eventType: 1,
  allTouches: [{ id: 1, x: 20, y: 20, absoluteX: 20, absoluteY: 20 }],
  changedTouches: [{ id: 1, x: 20, y: 20, absoluteX: 20, absoluteY: 20 }], pointerType: PointerType.TOUCH,
};
const manager: GestureStateManager = { handlerTag: 0, begin: jest.fn(), activate: jest.fn(), end: jest.fn(), fail: jest.fn() };
const pointer = { nativeEvent: { type: 'click', detail: 1, pointerType: 'mouse' } };
const a11y = { nativeEvent: { type: 'click' } }; // RN non-pointer Pressability.onClick.
const webA11y = { nativeEvent: { type: 'click', detail: 0, pointerType: '' } };
const keyboard = { nativeEvent: { type: 'keyup', key: 'Enter' } };
async function touchDown() {
  await act(async () => { pans().forEach((pan) => pan.handlers.onTouchesDown?.(down, manager)); });
}
async function drag(index = 0) {
  await touchDown();
  await act(async () => { pans()[index].handlers.onStart?.(event(State.ACTIVE)); });
  await act(async () => { pans()[index].handlers.onUpdate?.(event(State.ACTIVE, 150)); });
}
async function release(index = 0, success = true) {
  await act(async () => { pans()[index].handlers.onFinalize?.(event(success ? State.END : State.CANCELLED, 150), success); });
}
async function press(activation: { nativeEvent: unknown }) {
  await act(async () => { tile().props.onPress(activation); });
}
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
beforeAll(() => { previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT; actEnvironment.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });
beforeEach(async () => { open.mockClear(); await act(async () => { tree = create(<Probe />); }); });
afterEach(async () => { await act(async () => { tree.unmount(); }); });

describe('real lens hook activation after a pointer gesture', () => {
  it.each([0, 1])('releases pan %s, blocks trailing pointer clicks and permits non-pointer activation with no new touch', async (index) => {
    await drag(index);
    expect(current.inspecting).toBe(true); expect(current.selected).toBe(1);
    await press(a11y); expect(open).not.toHaveBeenCalled(); // Still actively dragging.
    await release(index);
    expect(current.inspecting).toBe(false); expect(current.selected).toBe(1);
    await press(pointer);
    await press({ nativeEvent: { type: 'click', detail: 1 } }); // RNWeb MouseEvent without pointerType.
    await press({ nativeEvent: { identifier: '1', touches: [], changedTouches: [] } }); // RN responder release.
    expect(open).not.toHaveBeenCalled();
    await press(a11y); await press(webA11y); await press(keyboard);
    expect(open).toHaveBeenCalledTimes(3);
    await press(pointer); expect(open).toHaveBeenCalledTimes(3); // Non-pointer activation does not consume suppression.
  });

  it('keeps a drag-generated click blocked across keyboard focus, inspect and dismissal', async () => {
    await drag(); await release();
    await act(async () => { tile().props.onFocus(); });
    expect(current.selected).toBe(1);
    await press(pointer); expect(open).not.toHaveBeenCalled();
    await press(keyboard); expect(open).toHaveBeenCalledTimes(1);
    await act(async () => { current.dismiss(); });
    expect(current.selected).toBe(-1);
    await press(pointer); expect(open).toHaveBeenCalledTimes(1);
    await press(a11y); expect(open).toHaveBeenCalledTimes(2);
  });

  it('allows a subsequent normal tap after a new touch without retaining suppression from the prior drag', async () => {
    await drag(); await release(); await press(pointer);
    expect(open).not.toHaveBeenCalled();
    await touchDown(); // Both pans fail to activate during this ordinary tap.
    await act(async () => { pans().forEach((pan) => pan.handlers.onFinalize?.(event(State.FAILED), false)); });
    await press(pointer); expect(open).toHaveBeenCalledTimes(1);
  });

  it('handles cancellation before activation and after an active drag without blocking later accessibility', async () => {
    await touchDown(); await release(0, false); await press(pointer);
    expect(open).toHaveBeenCalledTimes(1);
    await drag(); await release(0, false);
    expect(current.inspecting).toBe(false);
    await press(pointer); expect(open).toHaveBeenCalledTimes(1);
    await press(webA11y); expect(open).toHaveBeenCalledTimes(2);
    await touchDown(); await press(pointer); expect(open).toHaveBeenCalledTimes(3);
  });

  it('does not let cancellation of the losing pan release the active owner', async () => {
    await drag(0); await release(1, false);
    expect(current.inspecting).toBe(true);
    await press(keyboard); expect(open).not.toHaveBeenCalled();
    await release(0); await press(keyboard); expect(open).toHaveBeenCalledTimes(1);
  });

  it('retains native thresholds and clears old gesture state on a data/layout reset', async () => {
    expect(pans()[0].config).toMatchObject({ maxPointers: 1, activeOffsetXStart: -7, activeOffsetXEnd: 7, failOffsetYStart: -10, failOffsetYEnd: 10 });
    expect(pans()[1].config).toMatchObject({ maxPointers: 1, activateAfterLongPress: 320 });
    await drag(); await release();
    await act(async () => { tree.update(<Probe resetKey="replacement" />); });
    expect(current.selected).toBe(-1); expect(current.inspecting).toBe(false);
    await press(pointer); expect(open).toHaveBeenCalledTimes(1);
  });
});
