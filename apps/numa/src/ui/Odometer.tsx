import { useEffect } from 'react';
import { PixelRatio, Platform, Text, View, type TextStyle } from 'react-native';
import { webFont } from '@/theme/webFont';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { curves, duration } from '@/theme/tokens';
import { figureColumns, glyphMetrics } from './odometerFigure';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** The figure grows with the system text size up to this much. It is already the largest text on screen. */
const MAX_SCALE = 1.2;

function Glyph({ shown, index, style, textBox }: { shown: { value: number }; index: number; style: TextStyle; textBox: number }) {
  // Crossfade whole glyphs. A translating strip slides ink through the mask and, because the
  // box is taller than the line, out over the subtitle. Two places overlap only while both are fading.
  const anim = useAnimatedStyle(() => {
    const distance = Math.abs(shown.value - index);
    return { opacity: interpolate(distance, [0, 0.2, 0.8], [1, 1, 0], Extrapolation.CLAMP) };
  });
  return (
    <Animated.Text
      allowFontScaling={false}
      style={[style, anim, { position: 'absolute', left: 0, top: 0, height: textBox, lineHeight: textBox }]}
    >
      {index}
    </Animated.Text>
  );
}

function RollingDigit({ digit, style, textBox, fast }: { digit: number; style: TextStyle; textBox: number; fast: boolean }) {
  const reduce = useReducedMotion();
  const shown = useSharedValue(digit);
  useEffect(() => {
    shown.value = reduce ? digit : withTiming(digit, { duration: fast ? duration.quick : duration.roll, easing: Easing.bezier(...curves.soft) });
  }, [digit, fast, reduce, shown]);
  return (
    <View
      testID="odometer-digit"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'relative', height: textBox, overflow: 'hidden' }}
    >
      {/* The invisible digit gives the column its tabular width. */}
      <Text allowFontScaling={false} accessible={false} style={[style, { height: textBox, lineHeight: textBox, opacity: 0 }]}>0</Text>
      {DIGITS.map((index) => <Glyph key={index} shown={shown} index={index} style={style} textBox={textBox} />)}
    </View>
  );
}

function Mark({ char, style, textBox }: { char: string; style: TextStyle; textBox: number }) {
  return (
    <Text
      testID="odometer-mark"
      allowFontScaling={false}
      aria-hidden
      accessible={false}
      style={[style, { height: textBox, lineHeight: textBox }]}
    >
      {char}
    </Text>
  );
}

/**
 * Rolls each digit to its new value. Marks (currency, sign, separators) stay put.
 * The boxes are tall enough for the whole glyph; negative margins trim them back to the
 * style's line height. Glyphs crossfade in place, so the mask never slices one.
 */
export function Odometer({ text, style: base, fast = false }: { text: string; style: TextStyle; fast?: boolean }) {
  // The system would scale the glyphs but not the boxes measured here, clipping them (the large-text
  // bug). So the scale is applied here, once, and the system's own scaling is turned off.
  const root = Platform.OS === 'web' && typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 16;
  const scale = Platform.OS === 'web' ? (Number.isFinite(root) && root > 0 ? root / 16 : 1) : Math.min(PixelRatio.getFontScale(), MAX_SCALE);
  const fontSize = ((base.fontSize ?? 16) as number) * scale;
  const lineHeight = ((base.lineHeight ?? base.fontSize ?? 16) as number) * scale;
  const variant = [...new Set([...(base.fontVariant ?? []), 'tabular-nums' as const])];
  const style: TextStyle = {
    ...base,
    fontFamily: Platform.OS === 'web' ? webFont(base.fontFamily) : base.fontFamily,
    fontSize,
    lineHeight,
    fontVariant: variant,
    ...(base.letterSpacing !== undefined ? { letterSpacing: (base.letterSpacing as number) * scale } : {}),
  };
  const { textBox, trim } = glyphMetrics(fontSize, lineHeight);
  return (
    <View testID="odometer" style={{ flexDirection: 'row', alignItems: 'flex-end', marginVertical: -trim }} accessible accessibilityLabel={text}>
      {figureColumns(text).map((column) =>
        column.kind === 'digit' ? (
          <RollingDigit key={column.key} digit={column.digit} style={style} textBox={textBox} fast={fast} />
        ) : (
          <Mark key={column.key} char={column.char} style={style} textBox={textBox} />
        ),
      )}
    </View>
  );
}
