import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import type { EarningsDay } from '@/data/earnings';
import { useTheme } from '@/theme/theme';
import { curves, duration } from '@/theme/tokens';
import { useMoney } from '@/ui/money';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Each day's net as a bar, and the running total as a line drawn over them. */
export function EarningsChart({ series, height = 160 }: { series: EarningsDay[]; height?: number }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { progress.value = reduce ? 1 : withTiming(1, { duration: duration.draw, easing: Easing.bezier(...curves.draw) }); }, [reduce, progress, series.length]);

  const totals = series.map((d) => d.totalCents);
  const bars = series.map((d) => d.netCents);
  const top = Math.max(0, ...totals, ...bars), bottom = Math.min(0, ...totals, ...bars);
  const pad = 8;
  const y = (v: number) => (top === bottom ? height / 2 : pad + ((top - v) / (top - bottom)) * (height - pad * 2));
  const step = series.length ? width / series.length : 0;
  const x = (i: number) => step * i + step / 2;
  const d = series.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.totalCents)}`).join(' ');
  const len = series.reduce((t, p, i) => (i ? t + Math.hypot(step, y(p.totalCents) - y(series[i - 1].totalCents)) : 0), 0) + 1;
  const line = useAnimatedProps(() => ({ strokeDashoffset: (1 - progress.value) * len }));
  const last = series[series.length - 1];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessibilityRole="image"
      accessibilityLabel={last ? `Earnings over ${series.length} days, ${money(last.totalCents, { sign: true })} in total` : 'No earnings yet'}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={c.line2} strokeWidth={1} strokeDasharray="2 5" />
          {series.map((p, i) => {
            const w = Math.max(2, Math.min(18, step * 0.55));
            const y0 = y(0), y1 = y(p.netCents);
            return <Rect key={p.day} x={x(i) - w / 2} y={Math.min(y0, y1)} width={w} height={Math.max(1, Math.abs(y1 - y0))} rx={Math.min(3, w / 2)} fill={p.netCents >= 0 ? c.upInk : c.down} opacity={0.35} />;
          })}
          {series.length > 1 && <AnimatedPath d={d} fill="none" stroke={(last?.totalCents ?? 0) >= 0 ? c.upInk : c.down} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={[len, len]} animatedProps={line} />}
        </Svg>
      )}
    </View>
  );
}
