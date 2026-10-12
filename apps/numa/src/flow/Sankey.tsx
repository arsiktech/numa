import { Pressable, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';
import type { SankeyLayout, SankeyNode } from './sankey';

/**
 * The monochrome money split: neutral ribbons, green for what was kept, red-dashed
 * colour for money taken from savings. Tap a stream to follow it.
 */
export function Sankey({ layout, focus, onFocus }: { layout: SankeyLayout; focus: string | null; onFocus: (id: string | null) => void }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const reduce = useReducedMotion();
  const fill = (kind: SankeyNode['kind'], i: number) => (kind === 'kept' ? c.up : kind === 'savings' ? c.down : i % 2 ? c.rib2 : c.rib);
  const opacity = (id: string, kind: SankeyNode['kind']) => (focus === null ? (kind === 'kept' ? 0.55 : kind === 'savings' ? 0.45 : 1) : focus === id ? 1 : 0.18);
  const toggle = (id: string) => onFocus(focus === id ? null : id);

  const label = (n: SankeyNode) => {
    const room = n.h >= 30 ? 2 : n.h >= 15 ? 1 : 0;
    if (!room) return null;
    const style = { position: 'absolute' as const, top: n.y + n.h / 2 - (room === 2 ? 17 : 9), maxWidth: layout.width / 2 - 26, ...(n.side === 'left' ? { left: 12 } : { right: 12, alignItems: 'flex-end' as const }) };
    return (
      <Pressable key={n.id} onPress={() => toggle(n.id)} accessibilityRole="button" aria-selected={focus === n.id} accessibilityLabel={`${n.label}, ${hidden ? 'amount hidden' : money(n.cents)}. ${focus === n.id ? 'Following' : 'Follow this stream'}`} hitSlop={6} style={style}>
        <Txt v="small" numberOfLines={1} style={{ fontFamily: 'Manrope_700Bold', color: n.kind === 'kept' ? c.upInk : n.kind === 'savings' ? c.down : c.ink }}>{n.label}</Txt>
        {room === 2 && <Txt v="figureSm" c="ink2" numberOfLines={1}>{money(n.cents)}</Txt>}
      </Pressable>
    );
  };

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(600)} style={{ width: layout.width, height: layout.height }}>
      <Svg width={layout.width} height={layout.height}>
        {layout.ribbons.map((r, i) => <Path key={r.id} d={r.d} fill={fill(r.kind, i)} opacity={opacity(r.id, r.kind)} onPress={() => toggle(r.id)} />)}
        {layout.left.map((n) => <Rect key={n.id} x={0} y={n.y} width={6} height={n.h} rx={2} fill={n.kind === 'savings' ? c.down : c.ink} opacity={focus && focus !== n.id ? 0.3 : 1} />)}
        {layout.right.map((n) => <Rect key={n.id} x={layout.width - 6} y={n.y} width={6} height={n.h} rx={2} fill={n.kind === 'kept' ? c.up : c.ink} opacity={focus && focus !== n.id ? 0.3 : 1} />)}
        <Rect x={layout.center.x} y={layout.center.y} width={6} height={layout.center.h} rx={2} fill={c.ink} />
      </Svg>
      <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0 } as never}>
        {layout.left.map(label)}
        {layout.right.map(label)}
      </View>
    </Animated.View>
  );
}
