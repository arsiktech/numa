import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Safety, Zone } from '@/data/loans';
import { useTheme } from '@/theme/theme';
import { curves, duration } from '@/theme/tokens';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Where the zones start, as the share of the limit used: health factor 1.5 and 1.1. */
const WATCH = 1 / 1.5;
const DANGER = 1 / 1.1;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function useZoneColor() {
  const { c } = useTheme();
  return (z: Zone) => (z === 'danger' ? c.down : z === 'watch' ? c.warn : c.upInk);
}

export const zoneText = (s: Safety) => (s.zone === 'danger' ? 'Close to liquidation' : s.zone === 'watch' ? 'Worth watching' : 'Safe for now');

/**
 * How much room a loan has before the protocol sells what backs it: an arc filled to the share of
 * the borrowing limit in use, coloured by zone, with the cushion left as the headline.
 */
export function SafetyGauge({ safety, size = 280 }: { safety: Safety; size?: number }) {
  const { c } = useTheme();
  const color = useZoneColor()(safety.zone);
  const reduce = useReducedMotion();
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = r + stroke / 2;
  const at = (f: number) => ({ x: cx - r * Math.cos(Math.PI * f), y: cy - r * Math.sin(Math.PI * f) });
  const arc = (a: number, b: number) => { const p = at(a), q = at(b); return `M ${p.x} ${p.y} A ${r} ${r} 0 0 1 ${q.x} ${q.y}`; };
  const len = Math.PI * r * safety.used;
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { progress.value = reduce ? 1 : withTiming(1, { duration: duration.draw, easing: Easing.bezier(...curves.draw) }); }, [reduce, progress, safety.used]);
  const fill = useAnimatedProps(() => ({ strokeDashoffset: (1 - progress.value) * len }));
  const dot = at(safety.used);

  return (
    <View style={{ alignItems: 'center' }} accessibilityRole="image"
      accessibilityLabel={`${zoneText(safety)}. What backs it can fall ${pct(safety.cushion)} before it is sold. Health factor ${safety.health.toFixed(2)}.`}>
      <View style={{ width: size, height: cy + stroke / 2 + 4 }}>
        <Svg width={size} height={cy + stroke / 2 + 4}>
          {/* The zones, faint: safe, worth watching, close to liquidation. */}
          <Path d={arc(0, WATCH)} stroke={c.upInk} strokeOpacity={0.18} strokeWidth={stroke} fill="none" />
          <Path d={arc(WATCH, DANGER)} stroke={c.warn} strokeOpacity={0.22} strokeWidth={stroke} fill="none" />
          <Path d={arc(DANGER, 1)} stroke={c.down} strokeOpacity={0.3} strokeWidth={stroke} fill="none" />
          {safety.used > 0.001 && <AnimatedPath d={arc(0, safety.used)} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={[len, len]} animatedProps={fill} />}
          <Circle cx={dot.x} cy={dot.y} r={stroke / 2 + 3} fill={c.bg} stroke={color} strokeWidth={3} />
          {/* The point of liquidation. */}
          <Path d={`M ${cx + r - stroke / 2 - 4} ${cy} L ${cx + r + stroke / 2 + 4} ${cy}`} stroke={c.down} strokeWidth={2} />
        </Svg>
        {/* The cushion left, inside the arc. */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 4, alignItems: 'center', gap: 2 }}>
          <Txt v="figure" style={{ fontSize: 36, lineHeight: 42, color }}>{safety.cushion <= 0 ? '0%' : `−${pct(safety.cushion)}`}</Txt>
          <Txt v="small" c="ink2" style={{ textAlign: 'center' }}>{safety.cushion <= 0 ? 'At the liquidation point' : 'can fall before it’s sold'}</Txt>
        </View>
      </View>
      <View style={{ width: size, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Txt v="label" c="ink3" style={{ fontSize: 10 }}>NOTHING BORROWED</Txt>
        <Txt v="label" style={{ fontSize: 10, color: c.down }}>LIQUIDATION</Txt>
      </View>
      <View style={{ marginTop: 14, minHeight: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.s2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Txt v="small" style={{ fontFamily: 'Manrope_600SemiBold' }}>{zoneText(safety)} · health {safety.health.toFixed(2)}</Txt>
      </View>
      {safety.prices.length > 0 && <View style={{ marginTop: 14, alignSelf: 'stretch', paddingHorizontal: 16 }}><CoinPrices safety={safety} /></View>}
    </View>
  );
}

/**
 * Each coin behind a loan and the price it would have to fall to, on its own, for the loan to be sold;
 * then the cushion if everything falls together.
 */
export function CoinPrices({ safety, dense }: { safety: Safety; dense?: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  if (!safety.prices.length) return null;
  return (
    <View style={{ gap: dense ? 4 : 8 }}>
      {safety.prices.map((p) => (
        <View key={p.symbol} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <Txt v="small" c="ink2" style={{ flexShrink: 1 }}>{p.name}{p.nowCents !== null ? ` · now ${money(p.nowCents)}` : ''}</Txt>
          {p.drop === null
            ? <Txt v="small" c="ink3">Can’t trigger it alone</Txt>
            : <Txt v="figureSm" style={{ fontSize: 13, color: p.drop < 0.25 ? c.down : p.drop < 0.4 ? c.warn : c.ink }}>{p.liquidationCents !== null ? `sold below ${money(p.liquidationCents)}` : `sold after −${pct(p.drop)}`}</Txt>}
        </View>
      ))}
      {safety.prices.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Txt v="small" c="ink3">Everything falling together</Txt>
          <Txt v="figureSm" c="ink3" style={{ fontSize: 13 }}>−{pct(safety.cushion)}</Txt>
        </View>
      )}
    </View>
  );
}

/** The same in one line, for a list: a track with the zones and a marker where the loan sits. */
export function SafetyBar({ safety }: { safety: Safety }) {
  const { c } = useTheme();
  const color = useZoneColor()(safety.zone);
  return (
    <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: c.s2 }}>
      <View style={{ flexGrow: WATCH, flexBasis: 0, backgroundColor: c.upInk, opacity: 0.18 }} />
      <View style={{ flexGrow: DANGER - WATCH, flexBasis: 0, backgroundColor: c.warn, opacity: 0.22 }} />
      <View style={{ flexGrow: 1 - DANGER, flexBasis: 0, backgroundColor: c.down, opacity: 0.3 }} />
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(2, safety.used * 100)}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}
