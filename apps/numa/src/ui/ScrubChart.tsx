import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '@/theme/theme';
import { curves, duration } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = { values: number[]; /** Optional timestamps, so uneven saved points sit at their real dates. */ times?: number[]; height: number; up: boolean; onScrub: (index: number | null) => void; drawKey: string };

/** A single line of value over time. Drag (or hover on web) to read earlier values; the hero figure follows. */
export function ScrubChart({ values, times, height, up, onScrub, drawKey }: Props) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const n = values.length;
  const color = up ? c.up : c.down;

  const geo = useMemo(() => {
    if (!width || n < 2) return null;
    const min = Math.min(...values), max = Math.max(...values);
    const pad = 14;
    const t0 = times?.[0] ?? 0, span = times ? times[n - 1] - t0 : 0;
    const frac = (i: number) => (times && span > 0 ? (times[i] - t0) / span : i / (n - 1));
    const x = (i: number) => frac(i) * (width - pad);
    // A flat line sits in the middle rather than on the floor.
    const y = (v: number) => 16 + (max > min ? 1 - (v - min) / (max - min) : 0.5) * (height - 34);
    let length = 0;
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    for (let i = 1; i < n; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const d = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
    return { x, y, d, length, baseY: y(values[0]), frac };
  }, [values, times, width, height, n]);

  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { progress.value = 1; return; }
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.draw, easing: Easing.bezier(...curves.draw) });
  }, [drawKey, reduce, progress]);
  const len = geo?.length ?? 1;
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - progress.value) * len }));

  const indexAt = (px: number) => {
    const f = Math.max(0, Math.min(1, px / Math.max(1, width - 14)));
    if (!geo || !times) return Math.round(f * (n - 1));
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(geo.frac(i) - f) < Math.abs(geo.frac(best) - f)) best = i;
    return best;
  };
  const move = (px: number) => { const i = indexAt(px); setScrub(i); onScrub(i); };
  const end = () => { setScrub(null); onScrub(null); };
  const pan = Gesture.Pan().minDistance(0).runOnJS(true).onBegin((e) => move(e.x)).onUpdate((e) => move(e.x)).onFinalize(end);
  const hover = Gesture.Hover().runOnJS(true).onUpdate((e) => move(e.x)).onEnd(end);
  const gesture = Gesture.Simultaneous(pan, hover);

  return (
    <GestureDetector gesture={gesture}>
      <View testID="scrub-chart" style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel="Net worth over time. Drag to see earlier values.">
        {geo && (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={geo.baseY} y2={geo.baseY} stroke={c.line2} strokeWidth={1} strokeDasharray="2 5" />
            <Path d={geo.d} fill="none" stroke={c.line2} strokeWidth={2} strokeLinejoin="round" />
            <AnimatedPath d={geo.d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={[len, len]} animatedProps={animatedProps} />
            {scrub === null ? (
              <>
                <Circle cx={geo.x(n - 1)} cy={geo.y(values[n - 1])} r={9} fill={color} opacity={0.18} />
                <Circle cx={geo.x(n - 1)} cy={geo.y(values[n - 1])} r={4} fill={color} />
              </>
            ) : (
              <>
                <Line x1={geo.x(scrub)} x2={geo.x(scrub)} y1={10} y2={height} stroke={c.ink} strokeOpacity={0.45} strokeWidth={1} />
                <Circle cx={geo.x(scrub)} cy={geo.y(values[scrub])} r={6} fill={c.bg} stroke={color} strokeWidth={2.5} />
              </>
            )}
          </Svg>
        )}
      </View>
    </GestureDetector>
  );
}
