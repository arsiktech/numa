import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme';
import { onCategory, type CategoryColor } from '@/theme/tokens';
import { LensReadout } from './LensReadout';
import { useMoney } from './money';
import { squarify, type Tile } from './treemapLayout';
import { Txt } from './Txt';
import { useLensGeometry, useLensInteraction } from './useLensInteraction';

export type TreemapTile = {
  id: string; label: string; cents: number; color: CategoryColor | 'down';
  onPress?: () => void; a11y?: string; detail?: string;
};

function Drawing({ tile, rect, geometry, selected, total, sameColor }: {
  tile: TreemapTile; rect: Tile; geometry: Pick<SharedValue<number[]>, 'get'>; selected: boolean; total: number; sameColor: number;
}) {
  const { c } = useTheme();
  const { short, mask } = useMoney();
  const fill = tile.color === 'down' ? c.down : c[tile.color];
  const ink = tile.color === 'down' ? '#FFFFFF' : c[onCategory[tile.color]];
  const share = total > 0 && Number.isFinite(total) ? tile.cents / total : 0;
  const style = useAnimatedStyle(() => {
    const offset = 1 + rect.index * 4;
    const values = geometry.get();
    const w = Math.max(0, values[offset + 2] ?? rect.w), h = Math.max(0, values[offset + 3] ?? rect.h);
    // A gap must not erase a tiny tile. Hit-testing uses the entire original rectangle.
    const gx = Math.min(1, w * 0.08), gy = Math.min(1, h * 0.08);
    return { left: (values[offset] ?? rect.x) + gx, top: (values[offset + 1] ?? rect.y) + gy, width: Math.max(0, w - 2 * gx), height: Math.max(0, h - 2 * gy) };
  });
  const room = rect.w >= 64 && rect.h >= 40;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderRadius: 4, overflow: 'hidden', backgroundColor: fill, opacity: selected ? 1 : Math.max(0.55, 1 - sameColor * 0.09), justifyContent: 'flex-end' }, style]}>
      {(room || selected) && <View style={{ padding: 8 }}>
        <Txt v="label" numberOfLines={selected ? undefined : 1} style={{ color: ink, textTransform: 'none', letterSpacing: 0, fontSize: 12 }} maxFontSizeMultiplier={1.3}>{mask(tile.label)}</Txt>
        {(selected || rect.h >= 54) && <Txt v="figureSm" style={{ color: ink, fontSize: 13 }} maxFontSizeMultiplier={1.3}>{short(Math.round(tile.cents))}{selected || rect.w >= 110 ? mask(` · ${Math.round(share * 100)}%`) : ''}</Txt>}
      </View>}
    </Animated.View>
  );
}

/** Shared by every holdings/position treemap, including tiles that have no navigation action. */
export function Treemap({ tiles, height }: { tiles: TreemapTile[]; height: number }) {
  const { c } = useTheme();
  const { money, short, hidden, mask } = useMoney();
  const [width, setWidth] = useState(0);
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const shown = useMemo(() => tiles.filter((t) => Number.isFinite(t.cents) && t.cents > 0), [tiles]);
  const total = shown.reduce((sum, t) => sum + t.cents, 0);
  const rects = useMemo(() => squarify(shown.map((t) => t.cents), width, safeHeight), [shown, width, safeHeight]);
  const signature = JSON.stringify([width, safeHeight, shown.map((t) => [t.id, t.label, t.cents, t.detail])]);
  const interaction = useLensInteraction(rects, width, safeHeight, signature, shown.length);
  const geometry = useLensGeometry(rects, width, safeHeight, 'map', interaction);
  const selected = shown[interaction.selected];
  const share = selected && total > 0 && Number.isFinite(total) ? selected.cents / total : 0;
  return (
    <View style={{ overflow: 'visible', zIndex: selected ? 1 : 0 }}>
      <GestureDetector gesture={interaction.gesture} touchAction="pan-y">
        <View testID="treemap-lens-surface" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: safeHeight, borderRadius: 12, overflow: 'hidden', backgroundColor: shown.length ? 'transparent' : c.s1 }} accessibilityRole="none">
          {rects.map((r) => <Drawing key={shown[r.index].id} tile={shown[r.index]} rect={r} geometry={geometry} selected={r.index === interaction.selected} total={total}
            sameColor={shown.slice(0, r.index).filter((t) => t.color === shown[r.index].color).length} />)}
          {rects.map((r) => {
            const t = shown[r.index];
            const pct = total > 0 && Number.isFinite(total) ? Math.round(t.cents / total * 100) : 0;
            const label = mask(t.a11y ?? `${t.label}, ${hidden ? 'amount hidden' : short(Math.round(t.cents))}, ${pct} percent`);
            // Callback-only web controls have no href; link roles suppress RNWeb keyboard activation.
            return <Pressable key={t.id} onPress={(event) => { if (interaction.canOpen(event)) { interaction.inspect(r.index); t.onPress?.(); } }}
              onFocus={() => interaction.inspect(r.index)}
              accessibilityActions={[{ name: 'inspect', label: 'Inspect details' }]}
              onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'inspect') interaction.inspect(r.index); }}
              accessibilityRole={t.onPress && Platform.OS !== 'web' ? 'link' : 'button'} accessibilityLabel={`${label}${t.onPress ? '. Open' : '. Inspect'}`}
              style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h }} />;
          })}
        </View>
      </GestureDetector>
      <LensReadout label={selected && mask(selected.label)} amount={selected && `${money(Math.round(selected.cents), { cents: true })}${mask(` · ${Math.round(share * 100)}%`)}`}
        detail={selected?.detail ? mask(selected.detail) : undefined} surfaceHeight={safeHeight} inspecting={interaction.inspecting}
        selected={interaction.selected} count={shown.length} inspect={interaction.inspect} dismiss={interaction.dismiss} open={selected?.onPress} />
    </View>
  );
}
