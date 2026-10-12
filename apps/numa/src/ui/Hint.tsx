import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/** A first-visit tip: one sentence about the screen's main gesture, shown once, then remembered. */
export function Hint({ id, text }: { id: string; text: string }) {
  const { c } = useTheme();
  const { seenTips, seeTip, ready } = usePrefs();
  const reduce = useReducedMotion();
  if (!ready || seenTips.includes(id)) return null;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.delay(400).duration(450)} exiting={reduce ? undefined : FadeOut.duration(160)} accessibilityRole="alert"
      style={{ marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.up }} />
      <Txt v="body" c="bg" style={{ flex: 1, fontSize: 14 }}>{text}</Txt>
      <Pressable onPress={() => seeTip(id)} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' }}>
        <Txt v="cardTitle" c="bg" style={{ fontSize: 14 }}>Got it</Txt>
      </Pressable>
    </Animated.View>
  );
}
