import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme';
import { curves } from '@/theme/tokens';
import { Txt } from './Txt';

/** One first-visit tip: a ghost finger acts out the gesture, one sentence explains it, "Got it" dismisses it. */
export function CoachTip({ title, body, onDismiss, top, width, availableHeight }: { title: string; body: string; onDismiss: () => void; top: number; width: number; availableHeight?: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [cardHeight, setCardHeight] = useState(0);
  // Keep a measured tip inside its plot instead of beneath the following range row.
  const cardTop = availableHeight === undefined ? top : Math.min(top, Math.max(0, availableHeight - cardHeight));
  const x = useSharedValue(0.68);
  const o = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withSequence(withTiming(0.68, { duration: 0 }), withDelay(400, withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.quad) })), withTiming(0.3, { duration: 700 })), -1);
    o.value = withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(0.9, { duration: 400 }), withDelay(1500, withTiming(0, { duration: 700 }))), -1);
  }, [reduce, x, o]);
  const ghost = useAnimatedStyle(() => ({ left: x.value * width, opacity: o.value }));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: cardTop }}>
      {!reduce && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: top - cardTop - 64, width: 26, height: 26, borderRadius: 13, backgroundColor: c.ink, borderWidth: 6, borderColor: c.glassBorder }, ghost]} />}
      <Animated.View entering={reduce ? undefined : FadeIn.delay(900).duration(450).easing(Easing.bezier(...curves.soft))} testID="coach-tip" accessibilityRole="alert" onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)} style={{ alignSelf: 'center', maxWidth: 300, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.ink, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}>
        <Txt v="cardTitle" c="bg" style={{ fontSize: 14 }} maxFontSizeMultiplier={1.4}>{title}</Txt>
        <Txt v="small" c="bg" style={{ opacity: 0.75, marginTop: 3 }} maxFontSizeMultiplier={1.4}>{body}</Txt>
        <Pressable onPress={onDismiss} testID="coach-tip-dismiss" accessibilityRole="button" style={{ marginTop: 6, marginLeft: -10, minHeight: 34, paddingHorizontal: 10, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Txt v="cardTitle" c="bg" style={{ fontSize: 13.5 }} maxFontSizeMultiplier={1.4}>Got it</Txt>
        </Pressable>
      </Animated.View>
    </View>
  );
}
