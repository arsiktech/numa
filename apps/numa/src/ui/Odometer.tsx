import { useEffect } from 'react';
import { PixelRatio, Text, View, type TextStyle } from 'react-native';
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
          <Text key={n} allowFontScaling={false} style={[style, { height, lineHeight: height }]}>{n}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

// Manrope's ascent plus descent is about 1.37 em. Each digit's clipping box must hold the whole
// glyph, or iOS cuts off the top of the figure.
const GLYPH_BOX = 1.4;
/** The figure grows with the system text size up to this much. It is already the largest text on screen. */
const MAX_SCALE = 1.2;

/**
 * Rolls each digit to its new value. Non-digits render as plain text. The rolling boxes are tall
 * enough for the full glyph; negative margins trim them back to the style's line height, so the
 * figure takes the same room as plain text would.
 */
export function Odometer({ text, style: base, fast = false }: { text: string; style: TextStyle; fast?: boolean }) {
  // The system would scale the glyphs but not the boxes measured here, clipping them (the large-text
  // bug). So the scale is applied here, once, and the system's own scaling is turned off.
  const scale = Math.min(PixelRatio.getFontScale(), MAX_SCALE);
  const fontSize = ((base.fontSize ?? 16) as number) * scale;
  const lineHeight = ((base.lineHeight ?? base.fontSize ?? 16) as number) * scale;
  const style: TextStyle = { ...base, fontSize, lineHeight, ...(base.letterSpacing !== undefined ? { letterSpacing: (base.letterSpacing as number) * scale } : {}) };
  const height = Math.ceil(Math.max(lineHeight, fontSize * GLYPH_BOX));
  const trim = (height - lineHeight) / 2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginVertical: -trim }} accessible accessibilityLabel={text}>
      {text.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <Digit key={i} d={Number(ch)} style={style} height={height} fast={fast} />
        ) : (
          <Text key={i} allowFontScaling={false} style={[style, { height, lineHeight: height }]}>{ch}</Text>
        ),
      )}
    </View>
  );
}
