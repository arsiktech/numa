import { useEffect } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { curves, duration } from '@/theme/tokens';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Digit({ d, style, height, fast }: { d: number; style: TextStyle; height: number; fast: boolean }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(-d * height);
  useEffect(() => {
    y.value = reduce ? -d * height : withTiming(-d * height, { duration: fast ? duration.quick : duration.roll, easing: Easing.bezier(...curves.soft) });
  }, [d, height, fast, reduce, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={anim}>
        {DIGITS.map((n) => (
          <Text key={n} style={[style, { height, lineHeight: height }]}>{n}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

// Manrope's ascent plus descent is about 1.37 em. Each digit's clipping box must hold the whole
// glyph, or iOS cuts off the top of the figure.
const GLYPH_BOX = 1.4;

/**
 * Rolls each digit to its new value. Non-digits render as plain text. The rolling boxes are tall
 * enough for the full glyph; negative margins trim them back to the style's line height, so the
 * figure takes the same room as plain text would.
 */
export function Odometer({ text, style, fast = false }: { text: string; style: TextStyle; fast?: boolean }) {
  const fontSize = (style.fontSize ?? 16) as number;
  const lineHeight = (style.lineHeight ?? fontSize) as number;
  const height = Math.ceil(Math.max(lineHeight, fontSize * GLYPH_BOX));
  const trim = (height - lineHeight) / 2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginVertical: -trim }} accessible accessibilityLabel={text}>
      {text.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <Digit key={i} d={Number(ch)} style={style} height={height} fast={fast} />
        ) : (
          <Text key={i} style={[style, { height, lineHeight: height }]}>{ch}</Text>
        ),
      )}
    </View>
  );
}
