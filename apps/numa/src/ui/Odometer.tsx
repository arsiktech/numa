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

/** Rolls each digit to its new value. Non-digits render as plain text. */
export function Odometer({ text, style, fast = false }: { text: string; style: TextStyle; fast?: boolean }) {
  const height = (style.lineHeight ?? style.fontSize ?? 16) as number;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }} accessible accessibilityLabel={text}>
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
