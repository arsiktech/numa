import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatMoney, formatShort } from '@/domain/money';
import type { CategorySummary } from '@/domain/summary';
import type { CategoryId } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { duration, onCategory, type CategoryColor } from '@/theme/tokens';
import { Txt } from './Txt';

export type Lens = 'net' | 'liquid' | 'cash';

const meta: Record<CategoryId, { name: string; color: CategoryColor }> = {
  crypto: { name: 'Crypto', color: 'catAmber' },
  stocks: { name: 'Stocks', color: 'catBlue' },
  business: { name: 'Business', color: 'catViolet' },
  property: { name: 'Property', color: 'catSlate' },
  cash: { name: 'Cash', color: 'catSky' },
  things: { name: 'Things', color: 'catSand' },
};

function Block({ cat, lens, labelMin, height }: { cat: CategorySummary; lens: Lens; labelMin: number; height: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const m = meta[cat.category];
  const counts = lens === 'net' ? true : lens === 'liquid' ? cat.liquidCents > 0 : cat.cashCents > 0;
  const opacity = useSharedValue(counts ? 1 : 0.18);
  useEffect(() => { opacity.value = reduce ? (counts ? 1 : 0.18) : withTiming(counts ? 1 : 0.18, { duration: duration.morph }); }, [counts, reduce, opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ flexGrow: cat.cents, flexBasis: 0, backgroundColor: c[m.color], height, justifyContent: 'flex-end', paddingLeft: 8, paddingRight: 2, paddingBottom: 7, overflow: 'hidden' }, anim]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${m.name}, ${formatMoney(cat.cents)}`} style={{ position: 'absolute', inset: 0 } as never} />
      {cat.share >= labelMin && (
        <>
          <Txt v="label" style={{ color: c[onCategory[m.color]], textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }} numberOfLines={1} ellipsizeMode="clip">{m.name}</Txt>
          <Txt v="figureSm" style={{ color: c[onCategory[m.color]] }} numberOfLines={1} ellipsizeMode="clip">{formatShort(cat.cents)}</Txt>
        </>
      )}
    </Animated.View>
  );
}

/** What you own as category blocks, and what you owe hatched beside what is left. Widths are values. */
export function CompositionBar({ categories, ownCents, oweCents, netCents, lens, wide = false }: { categories: CategorySummary[]; ownCents: number; oweCents: number; netCents: number; lens: Lens; wide?: boolean }) {
  const { c } = useTheme();
  const h = wide ? 96 : 60;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Txt v="small" c="ink2" style={{ fontSize: 14 }}>What you own</Txt>
        <Txt v="figureSm" style={{ fontSize: 14 }}>{formatMoney(ownCents)}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 2, borderRadius: 10, overflow: 'hidden' }}>
        {categories.map((cat) => <Block key={cat.category} cat={cat} lens={lens} labelMin={wide ? 0.075 : 0.16} height={h} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 2, borderRadius: 10, overflow: 'hidden', marginTop: 2 }}>
        <View style={{ flexGrow: oweCents, flexBasis: 0, height: wide ? 56 : 60, backgroundColor: c.down, overflow: 'hidden' }} accessibilityLabel={`Debts, ${formatMoney(oweCents)}`}>
          {Array.from({ length: 14 }, (_, i) => (
            <View key={i} style={{ position: 'absolute', top: -20, left: -40 + i * 14, width: 7, height: 120, backgroundColor: c.downDeep, transform: [{ rotate: '45deg' }] }} />
          ))}
        </View>
        <View style={{ flexGrow: Math.max(netCents, 0), flexBasis: 0, height: wide ? 56 : 60, backgroundColor: c.netBg, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 8 }}>
          <Txt v="label" c="upInk" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>Net worth</Txt>
          <Txt v="figureSm" c="upInk">{formatMoney(netCents)}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.down }} />
          <Txt v="small" c="ink2" style={{ fontSize: 14 }}>What you owe</Txt>
        </View>
        <Txt v="figureSm" style={{ fontSize: 14 }}>{formatMoney(oweCents)}</Txt>
      </View>
    </View>
  );
}

export const categoryName = (id: CategoryId) => meta[id].name;
