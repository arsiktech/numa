import { useEffect, useId } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Txt } from './Txt';

const OIL = ['#FF5FA2', '#9B6BFF', '#4CC9F0', '#5EF2B5', '#F4E46A', '#FF9A62'];

/**
 * The iridescent PRO badge, like oil on water: an oversized film of colour turns once
 * every 9 seconds under a fixed highlight. With reduced motion it holds still.
 * The wordmark next to it stays plain ink.
 */
export function ProBadge({ size = 20 }: { size?: number }) {
  const h = size, w = Math.round(size * 2);
  const film = Math.ceil(Math.hypot(w, h)) + 4;
  // Each badge needs its own gradient IDs; two badges on one screen would otherwise share them.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) { cancelAnimation(turn); turn.value = 0; return; }
    turn.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduce, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <View style={{ width: w, height: h, borderRadius: Math.round(h * 0.3), overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ position: 'absolute', width: film, height: film, left: (w - film) / 2, top: (h - film) / 2 }, spin]}>
        <Svg width={film} height={film}>
          <Defs>
            <LinearGradient id={`oil${uid}`} x1="0" y1="1" x2="1" y2="0">
              {OIL.concat(OIL[0]).map((col, i) => <Stop key={i} offset={i / OIL.length} stopColor={col} />)}
            </LinearGradient>
          </Defs>
          <Rect width={film} height={film} fill={`url(#oil${uid})`} />
        </Svg>
      </Animated.View>
      <Svg width={w} height={h} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id={`shine${uid}`} cx="0.25" cy="0" r="0.9">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill={`url(#shine${uid})`} />
      </Svg>
      <Txt v="label" allowFontScaling={false} style={{ color: '#0B0B0C', fontSize: Math.round(h * 0.52 * 10) / 10, letterSpacing: h * 0.07 }}>Pro</Txt>
    </View>
  );
}
