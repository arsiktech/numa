import * as Haptics from 'expo-haptics';
import { useEffect, useId, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Line, Path, Rect } from 'react-native-svg';

import { changeLabel } from '@/data/series';

import { useTheme } from '@/theme/theme';
import { curves, duration } from '@/theme/tokens';
import { Txt } from './Txt';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  values: number[];
  /** Optional timestamps, so uneven saved points sit at their real dates. */
  times?: number[];
  height: number;
  up: boolean;
  drawKey: string;
  /** The point kept after the finger lifts, or null for today. */
  pinned: number | null;
  /** Called while dragging or hovering, and with null when that ends. */
  onPreview: (index: number | null) => void;
  /** Called when a drag ends or the line is tapped, to keep that point. */
  onPin: (index: number) => void;
  /** Words for the point under the finger and for the time axis, shown only while scrubbing. */
  labels?: { times: number[]; at: (index: number) => string; tick: (t: number) => string };
};

/**
 * Touch feel, as in a dial: a light tick each time the finger reaches another point (at most every
 * 35 ms), and a soft tap when a date is kept. Phones only; one chart is scrubbed at a time.
 */
const feel = (() => {
  let last = -1, at = 0;
  const on = Platform.OS !== 'web';
  return {
    tick(i: number) {
      if (!on || i === last) return;
      last = i;
      const now = Date.now();
      if (now - at < 35) return;
      at = now;
      void Haptics.selectionAsync().catch(() => undefined);
    },
    keep() { if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); },
    reset() { last = -1; },
  };
})();

// Room above the line for the date under the finger, and below it for the time axis.
const TOP = 26;
const BOTTOM = 24;
const PAD = 14;

/**
 * A single line of value over time. Drag (or hover on web) to read earlier values; the hero figure
 * follows. Letting go, or tapping the line, keeps that date so the blocks below can be opened for it.
 * While a point is picked the line after it fades, the date floats above it, and the axes appear:
 * change from the start on the right, time along the bottom. At rest the line stands alone.
 */
export function ScrubChart({ values, times, height, up, drawKey, pinned, onPreview, onPin, labels }: Props) {
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const scrub = preview ?? (pinned !== null && pinned < values.length ? pinned : null);
  const n = values.length;
  const color = up ? c.up : c.down;

  const geo = useMemo(() => {
    if (!width || n < 2) return null;
    const min = Math.min(...values), max = Math.max(...values);
    const t0 = times?.[0] ?? 0, span = times ? times[n - 1] - t0 : 0;
    const frac = (i: number) => (times && span > 0 ? (times[i] - t0) / span : i / (n - 1));
    const x = (i: number) => frac(i) * (width - PAD);
    // A flat line sits in the middle rather than on the floor.
    const y = (v: number) => TOP + (max > min ? 1 - (v - min) / (max - min) : 0.5) * (height - TOP - BOTTOM);
    let length = 0;
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    for (let i = 1; i < n; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const d = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
    return { x, y, d, length, baseY: y(values[0]), frac, min, max };
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
    const f = Math.max(0, Math.min(1, px / Math.max(1, width - PAD)));
    if (!geo || !times) return Math.round(f * (n - 1));
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(geo.frac(i) - f) < Math.abs(geo.frac(best) - f)) best = i;
    return best;
  };
  const keep = (i: number) => { feel.keep(); onPin(i); };
  const move = (px: number) => { const i = indexAt(px); feel.tick(i); setPreview(i); onPreview(i); };
  const clear = () => { setPreview(null); onPreview(null); };
  // Only a sideways drag scrubs; a vertical swipe that starts on the chart scrolls the page.
  const pan = Gesture.Pan().activeOffsetX([-6, 6]).failOffsetY([-10, 10]).runOnJS(true)
    .onStart((e) => move(e.x)).onUpdate((e) => move(e.x))
    .onEnd((e, ok) => { if (ok) keep(indexAt(e.x)); })
    .onFinalize(() => { feel.reset(); clear(); });
  const tap = Gesture.Tap().runOnJS(true).onEnd((e, ok) => { if (ok) keep(indexAt(e.x)); });
  const hover = Gesture.Hover().runOnJS(true).onUpdate((e) => move(e.x)).onEnd(clear);
  const gesture = Gesture.Simultaneous(Gesture.Exclusive(pan, tap), hover);

  const sx = geo && scrub !== null ? geo.x(scrub) : 0;
  // Value axis: the top, the start and the bottom of the line, as change from the start.
  const valueTicks = geo && scrub !== null
    ? [geo.max, values[0], geo.min]
        .map((v) => ({ y: geo.y(v), text: changeLabel(v, values[0]) }))
        .filter((t, i, all) => t.text !== null && all.findIndex((o) => Math.abs(o.y - t.y) < 16) === i)
    : [];
  const timeTicks = geo && scrub !== null && labels ? [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
    const i = indexAt(f * (width - PAD));
    return { x: f * (width - PAD), text: labels.tick(labels.times[i] ?? labels.times[0]) };
  }).filter((t, i, all) => all.findIndex((o) => o.text === t.text) === i) : [];

  return (
    <GestureDetector gesture={gesture}>
      <View testID="scrub-chart" style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel="Net worth over time. Drag or tap to pick a date.">
        {geo && (
          <Svg width={width} height={height}>
            <Defs>
              <ClipPath id={`${clipId}past`}><Rect x={0} y={0} width={Math.max(0, sx)} height={height} /></ClipPath>
              <ClipPath id={`${clipId}after`}><Rect x={sx} y={0} width={Math.max(0, width - sx)} height={height} /></ClipPath>
            </Defs>
            <Line x1={0} x2={width} y1={geo.baseY} y2={geo.baseY} stroke={c.line2} strokeWidth={1} strokeDasharray="2 5" />
            {scrub === null ? (
              <>
                <Path d={geo.d} fill="none" stroke={c.line2} strokeWidth={2} strokeLinejoin="round" />
                <AnimatedPath d={geo.d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={[len, len]} animatedProps={animatedProps} />
                <Circle cx={geo.x(n - 1)} cy={geo.y(values[n - 1])} r={9} fill={color} opacity={0.18} />
                <Circle cx={geo.x(n - 1)} cy={geo.y(values[n - 1])} r={4} fill={color} />
              </>
            ) : (
              <>
                {/* Up to the picked point the line is solid; after it, it steps back. */}
                <Path d={geo.d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId}past)`} />
                <Path d={geo.d} fill="none" stroke={c.line2} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId}after)`} />
                <Circle cx={sx} cy={geo.y(values[scrub])} r={15} fill={c.ink} opacity={0.1} />
                <Circle cx={sx} cy={geo.y(values[scrub])} r={5.5} fill={color} />
              </>
            )}
          </Svg>
        )}
        {geo && scrub !== null && labels && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 2, left: Math.max(0, Math.min(width - 150, sx - 75)), width: 150, alignItems: 'center' }}>
            <Txt v="small" c="ink3" numberOfLines={1} style={{ fontSize: 12.5 }}>{labels.at(scrub)}</Txt>
          </View>
        )}
        {valueTicks.map((t) => (
          <View key={t.text} pointerEvents="none" style={{ position: 'absolute', right: 6, top: t.y - 18 }}>
            <Txt v="figureSm" c="ink3" style={{ fontSize: 11 }}>{t.text}</Txt>
          </View>
        ))}
        {timeTicks.map((t) => (
          <View key={t.text} pointerEvents="none" style={{ position: 'absolute', bottom: 2, left: t.x - 40, width: 80, alignItems: 'center' }}>
            <Txt v="small" c="ink3" numberOfLines={1} style={{ fontSize: 11.5 }}>{t.text}</Txt>
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}
