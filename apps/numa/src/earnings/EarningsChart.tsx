import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { EarningsDay } from '@/data/earnings';
import { useTheme } from '@/theme/theme';
import { curves, duration } from '@/theme/tokens';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const HEIGHT = 200;
/** Bars sit in the lower part, so small days stay readable beside a growing total. */
const BASE = 182, BAR_TOP = 112;
/** The running total uses the whole height, on its own scale. */
const RUN_TOP = 18, RUN_BOTTOM = 178;
const TIP_W = 136;

export const dayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** One day's bar: rounded, grows up from the baseline (down, for a day that lost), each a beat after the last. */
function Bar({ x, w, value, scale, fill, index, faded }: { x: number; w: number; value: number; scale: number; fill: string; index: number; faded: boolean }) {
  const reduce = useReducedMotion();
  const grow = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    grow.value = reduce ? 1 : withDelay(Math.min(index, 60) * 22, withTiming(1, { duration: duration.roll, easing: Easing.bezier(...curves.soft) }));
  }, [reduce, grow, index]);
  const h = Math.max(2, Math.abs(value) * scale);
  const props = useAnimatedProps(() => ({ height: h * grow.value, y: value >= 0 ? BASE - h * grow.value : BASE }));
  return <AnimatedRect x={x} width={w} rx={Math.min(w / 2, 8)} fill={fill} opacity={faded ? 0.3 : 1} animatedProps={props} />;
}

/**
 * Each day's net as a bar and the running total as a line with a soft fill. Tapping a day fades the
 * others, marks it on the line and shows what it earned and paid; tapping it again lets go.
 */
export function EarningsChart({ series, selected, onSelect }: { series: EarningsDay[]; selected: number | null; onSelect: (i: number | null) => void }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    draw.value = 0;
    draw.value = reduce ? 1 : withDelay(300, withTiming(1, { duration: duration.draw, easing: Easing.bezier(...curves.draw) }));
  }, [reduce, draw, series.length]);

  const n = series.length;
  const step = n ? width / n : 0;
  const bw = Math.max(2, Math.min(18, step * 0.6));
  const top = Math.max(1, ...series.map((d) => d.netCents)), bottom = Math.min(0, ...series.map((d) => d.netCents));
  const scale = (BASE - BAR_TOP) / (top - bottom);
  const totals = series.map((d) => d.totalCents);
  const hi = Math.max(1, ...totals), lo = Math.min(0, ...totals);
  const ry = (v: number) => RUN_BOTTOM - ((v - lo) / (hi - lo)) * (RUN_BOTTOM - RUN_TOP);
  const cx = (i: number) => step * i + step / 2;
  const line = series.map((d, i) => `${i ? 'L' : 'M'} ${cx(i).toFixed(1)} ${ry(d.totalCents).toFixed(1)}`).join(' ');
  const area = n > 1 ? `${line} L ${cx(n - 1).toFixed(1)} ${BASE} L ${cx(0).toFixed(1)} ${BASE} Z` : '';
  const len = series.reduce((t, d, i) => (i ? t + Math.hypot(step, ry(d.totalCents) - ry(series[i - 1].totalCents)) : 0), 0) + 1;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: (1 - draw.value) * len }));
  const areaProps = useAnimatedProps(() => ({ opacity: draw.value }));
  const lineColor = (series[n - 1]?.totalCents ?? 0) >= 0 ? c.upInk : c.down;
  const pick = selected !== null ? series[selected] : null;

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <LinearGradient id="earnArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.22} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id="earnBar" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.upInk} stopOpacity={1} />
                <Stop offset="1" stopColor={c.upInk} stopOpacity={0.45} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={width} y1={60} y2={60} stroke={c.line} strokeWidth={1} />
            <Line x1={0} x2={width} y1={110} y2={110} stroke={c.line} strokeWidth={1} />
            {area !== '' && <AnimatedPath d={area} fill="url(#earnArea)" animatedProps={areaProps} />}
            <Line x1={0} x2={width} y1={BASE} y2={BASE} stroke={c.line2} strokeWidth={1} strokeDasharray="2 5" />
            {series.map((d, i) => (
              <Bar key={d.day} x={cx(i) - bw / 2} w={bw} value={d.netCents} scale={scale} index={i} faded={selected !== null && selected !== i}
                fill={d.netCents >= 0 ? 'url(#earnBar)' : c.down} />
            ))}
            {n > 1 && <AnimatedPath d={line} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={pick ? 0.35 : 1} strokeDasharray={[len, len]} animatedProps={lineProps} />}
            {pick && selected !== null && (
              <>
                <Line x1={cx(selected)} x2={cx(selected)} y1={0} y2={HEIGHT} stroke={c.line2} strokeWidth={1} strokeDasharray="3 4" />
                <Circle cx={cx(selected)} cy={ry(pick.totalCents)} r={5} fill={c.bg} stroke={lineColor} strokeWidth={2.5} />
              </>
            )}
          </Svg>
        )}
        {/* One tap target per day, over the chart. */}
        {width > 0 && series.map((d, i) => (
          <Pressable key={d.day} onPress={() => onSelect(selected === i ? null : i)} accessibilityRole="button"
            accessibilityLabel={`${dayText(d.day)}: net ${money(d.netCents, { cents: true, sign: true })}, earned ${money(d.earnedCents, { cents: true })}, interest ${money(d.paidCents, { cents: true })}`}
            style={{ position: 'absolute', left: step * i, top: 0, width: step, height: HEIGHT }} />
        ))}
        {pick && selected !== null && (
          <View pointerEvents="none" style={{ position: 'absolute', top: -6, left: Math.max(0, Math.min(width - TIP_W, cx(selected) - TIP_W / 2)), width: TIP_W, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, gap: 2 }}>
            <Txt v="label" c="ink2">{dayText(pick.day).toUpperCase()}</Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v="small" c="ink2">Earned</Txt>
              <Txt v="figureSm" c="upInk">{money(pick.earnedCents, { cents: true, sign: true })}</Txt>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v="small" c="ink2">Interest</Txt>
              <Txt v="figureSm" style={{ color: c.down }}>{money(-pick.paidCents, { cents: true, sign: true })}</Txt>
            </View>
          </View>
        )}
      </View>
      {n > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Txt v="figureSm" c="ink3" style={{ fontSize: 11 }}>{dayText(series[0].day)}</Txt>
          {n > 2 && <Txt v="figureSm" c="ink3" style={{ fontSize: 11 }}>{dayText(series[Math.floor((n - 1) / 2)].day)}</Txt>}
          {n > 1 && <Txt v="figureSm" c="ink3" style={{ fontSize: 11 }}>{dayText(series[n - 1].day)}</Txt>}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 10, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c.upInk }} /><Txt v="small" c="ink2">Net each day</Txt></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 2.5, borderRadius: 2, backgroundColor: lineColor }} /><Txt v="small" c="ink2">Running total</Txt></View>
        <Txt v="small" c="ink3" style={{ marginLeft: 'auto' }}>Tap a day</Txt>
      </View>
    </View>
  );
}
