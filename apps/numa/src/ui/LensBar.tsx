import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { duration } from '@/theme/tokens';

import { barRects, proportionalWidths } from './lens';
import { LensReadout } from './LensReadout';
import { useMoney } from './money';
import type { Tile } from './treemapLayout';
import { Txt } from './Txt';
import { useLensGeometry, useLensInteraction } from './useLensInteraction';

export type BarEntry = {
  id: string; name: string; cents: number; fill: string; ink: string; detail?: string;
  onPress?: () => void; opacity?: number; hatch?: string; fullAmount?: boolean;
};

function Drawing({ entry, rect, geometry, selected, labelMin, total }: { entry: BarEntry; rect: Tile; geometry: Pick<SharedValue<number[]>, 'get'>; selected: boolean; labelMin: number; total: number }) {
  const { short, money, mask } = useMoney();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(entry.opacity ?? 1);
  const dim = entry.opacity ?? 1;
  useEffect(() => { opacity.set(reduce ? dim : withTiming(dim, { duration: duration.morph })); }, [dim, reduce, opacity]);
  const style = useAnimatedStyle(() => {
    const offset = 1 + rect.index * 4;
    const values = geometry.get();
    const w = values[offset + 2] ?? rect.w;
    return { left: values[offset] ?? rect.x, width: Math.max(0, w - Math.min(2, w * 0.12)), opacity: opacity.get() };
  });
  const show = selected || (total > 0 && Number.isFinite(total) && entry.cents / total >= labelMin);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, height: rect.h, backgroundColor: entry.fill, overflow: 'hidden', justifyContent: 'flex-end' }, style]}>
      {entry.hatch && Array.from({ length: 32 }, (_, i) => <View key={i} style={{ position: 'absolute', top: -20, left: -40 + i * 14, width: 7, height: 160, backgroundColor: entry.hatch, transform: [{ rotate: '45deg' }] }} />)}
      {show && <View style={{ paddingLeft: 8, paddingBottom: 7, paddingRight: 2 }}>
        <Txt v="label" style={{ color: entry.ink, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{mask(entry.name)}</Txt>
        <Txt v="figureSm" style={{ color: entry.ink }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{entry.fullAmount ? money(Math.round(entry.cents)) : short(Math.round(entry.cents))}</Txt>
      </View>}
    </Animated.View>
  );
}

export function LensBar({ entries, height, labelMin, emptyColor }: { entries: BarEntry[]; height: number; labelMin: number; emptyColor: string }) {
  const { money, hidden, mask } = useMoney();
  const [width, setWidth] = useState(0);
  const shown = useMemo(() => entries.filter((e) => Number.isFinite(e.cents) && e.cents > 0), [entries]);
  const signature = JSON.stringify([width, height, shown.map((e) => [e.id, e.name, e.cents, e.detail])]);
  const rects = useMemo(() => barRects(proportionalWidths(shown.map((e) => e.cents), width), height), [shown, width, height]);
  const interaction = useLensInteraction(rects, width, height, signature, shown.length);
  const geometry = useLensGeometry(rects, width, height, 'bar', interaction);
  const selected = shown[interaction.selected];
  const total = shown.reduce((sum, e) => sum + e.cents, 0);
  return (
    <View style={{ overflow: 'visible', zIndex: selected ? 1 : 0 }}>
      <GestureDetector gesture={interaction.gesture} touchAction="pan-y">
        <View testID="bar-lens-surface" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, borderRadius: 10, overflow: 'hidden', backgroundColor: shown.length ? 'transparent' : emptyColor }}>
          {rects.map((r) => <Drawing key={shown[r.index].id} entry={shown[r.index]} rect={r} geometry={geometry} selected={interaction.selected === r.index} total={total} labelMin={labelMin} />)}
          {/* These original hit targets never move with the animated drawings. */}
          {rects.map((r) => {
            const e = shown[r.index];
            // Callback-only web controls have no href; link roles suppress RNWeb keyboard activation.
            return <Pressable key={e.id} onPress={(event) => { if (interaction.canOpen(event)) { interaction.inspect(r.index); e.onPress?.(); } }}
              onFocus={() => interaction.inspect(r.index)}
              accessibilityActions={[{ name: 'inspect', label: 'Inspect details' }]}
              onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'inspect') interaction.inspect(r.index); }}
              accessibilityRole={e.onPress && Platform.OS !== 'web' ? 'link' : 'button'} accessibilityLabel={`${mask(e.name)}, ${hidden ? 'amount hidden' : money(Math.round(e.cents))}${e.onPress ? '. Open' : '. Inspect'}`}
              style={{ position: 'absolute', left: r.x, top: 0, width: r.w, height }} />;
          })}
        </View>
      </GestureDetector>
      <LensReadout label={selected && mask(selected.name)} amount={selected && money(Math.round(selected.cents), { cents: true })}
        detail={selected?.detail ? mask(selected.detail) : undefined} surfaceHeight={height} inspecting={interaction.inspecting}
        selected={interaction.selected} count={shown.length} inspect={interaction.inspect} dismiss={interaction.dismiss} open={selected?.onPress} />
    </View>
  );
}
