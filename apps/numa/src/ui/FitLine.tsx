import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

type Sized = { fontSize: number; lineHeight: number; letterSpacing?: number };

/** A text style at `scale` times its size. */
export const scaleType = <T extends Sized>(t: T, scale: number): T => ({
  ...t, fontSize: t.fontSize * scale, lineHeight: t.lineHeight * scale,
  ...(t.letterSpacing !== undefined ? { letterSpacing: t.letterSpacing * scale } : {}),
});

/**
 * One line of large figures that shrinks to the width it has, so a long amount on a narrow phone
 * stays whole instead of running off the edge or wrapping in the middle of the number.
 *
 * `children` gets the scale (1 when the line fits, less when it does not, never below `min`) and
 * applies it to its own font sizes with `scaleType`. The line is measured at its natural width: the
 * inner row never shrinks, and the outer row reports the room there is.
 */
export function FitLine({ children, min = 0.5, style }: { children: (scale: number) => ReactNode; min?: number; style?: ViewStyle }) {
  const [room, setRoom] = useState(0);
  const [natural, setNatural] = useState(0);
  const scale = room > 0 && natural > room ? Math.max(min, room / natural) : 1;
  const settle = (set: typeof setRoom, next: number) => set((was) => (Math.abs(was - next) < 1 ? was : next));
  return (
    // The content is measured at the scale this render drew it with; dividing gives its full-size width.
    <View style={[{ flexDirection: 'row' }, style]} onLayout={(e: LayoutChangeEvent) => settle(setRoom, e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexShrink: 0 }} onLayout={(e: LayoutChangeEvent) => settle(setNatural, e.nativeEvent.layout.width / scale)}>
        {children(scale)}
      </View>
    </View>
  );
}
