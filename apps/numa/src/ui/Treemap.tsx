import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import type { CategoryColor } from '@/theme/tokens';
import { onCategory } from '@/theme/tokens';
import { useMoney } from './money';
import { squarify } from './treemapLayout';
import { Txt } from './Txt';

export type TreemapTile = { id: string; label: string; cents: number; color: CategoryColor | 'down'; onPress?: () => void; a11y?: string };

const GAP = 2;

/**
 * What a group is made of, as areas: each tile's size is its value. Within one colour, bigger
 * tiles are fuller and smaller ones lighter, so the order reads at a glance. Labels show when a
 * tile is big enough to hold them.
 */
export function Treemap({ tiles, height }: { tiles: TreemapTile[]; height: number }) {
  const { c } = useTheme();
  const { short, hidden } = useMoney();
  const [width, setWidth] = useState(0);
  const shown = tiles.filter((t) => t.cents > 0);
  const total = shown.reduce((s, t) => s + t.cents, 0);
  const rects = width > 0 ? squarify(shown.map((t) => t.cents), width + GAP, height + GAP) : [];
  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: shown.length ? 'transparent' : c.s1 }}
      accessibilityRole="none">
      {rects.map((r) => {
        const t = shown[r.index];
        const rank = r.index;
        const sameColor = shown.slice(0, rank).filter((o) => o.color === t.color).length;
        const fill = t.color === 'down' ? c.down : c[t.color];
        const ink = t.color === 'down' ? '#FFFFFF' : c[onCategory[t.color]];
        const share = t.cents / total;
        const w = r.w - GAP, h = r.h - GAP;
        const room = w >= 64 && h >= 40;
        const tile = (
          <View style={{ flex: 1, padding: 8, justifyContent: 'flex-end', backgroundColor: fill, opacity: Math.max(0.55, 1 - sameColor * 0.09) }}>
            {room && <Txt v="label" numberOfLines={1} style={{ color: ink, textTransform: 'none', letterSpacing: 0, fontSize: 12 }} maxFontSizeMultiplier={1.3}>{t.label}</Txt>}
            {room && h >= 54 && <Txt v="figureSm" numberOfLines={1} style={{ color: ink, fontSize: 13 }} maxFontSizeMultiplier={1.3}>{short(t.cents)}{w >= 110 ? ` · ${Math.round(share * 100)}%` : ''}</Txt>}
          </View>
        );
        const style = { position: 'absolute' as const, left: r.x, top: r.y, width: w, height: h, borderRadius: 4, overflow: 'hidden' as const };
        const label = t.a11y ?? `${t.label}, ${hidden ? 'amount hidden' : short(t.cents)}, ${Math.round(share * 100)} percent`;
        return t.onPress ? (
          <Pressable key={t.id} onPress={t.onPress} accessibilityRole="link" accessibilityLabel={`${label}. Open`} style={style}>{tile}</Pressable>
        ) : (
          <View key={t.id} accessible accessibilityLabel={label} style={style}>{tile}</View>
        );
      })}
    </View>
  );
}
