import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { CategorySummary } from '@/domain/summary';
import type { CategoryId } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { duration, onCategory, type CategoryColor } from '@/theme/tokens';
import { useMoney } from './money';
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

function Block({ cat, lens, labelMin, height, name }: { cat: CategorySummary; lens: Lens; labelMin: number; height: number; name?: string }) {
  const { c } = useTheme();
  const { money, short, hidden } = useMoney();
  const reduce = useReducedMotion();
  const m = { ...meta[cat.category], name: name ?? meta[cat.category].name };
  const counts = lens === 'net' ? true : lens === 'liquid' ? cat.liquidCents > 0 : cat.cashCents > 0;
  const opacity = useSharedValue(counts ? 1 : 0.18);
  useEffect(() => { opacity.value = reduce ? (counts ? 1 : 0.18) : withTiming(counts ? 1 : 0.18, { duration: duration.morph }); }, [counts, reduce, opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ flexGrow: cat.cents, flexBasis: 0, backgroundColor: c[m.color], height, justifyContent: 'flex-end', paddingLeft: 8, paddingRight: 2, paddingBottom: 7, overflow: 'hidden' }, anim]}>
      <Pressable onPress={() => router.push({ pathname: '/holdings/[group]', params: { group: cat.category } })} accessibilityRole="link" accessibilityLabel={`${m.name}, ${hidden ? 'amount hidden' : money(cat.cents)}. Open`} style={{ position: 'absolute', inset: 0, zIndex: 1 } as never} />
      {cat.share >= labelMin && (
        <>
          <Txt v="label" style={{ color: c[onCategory[m.color]], textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }} numberOfLines={1} ellipsizeMode="clip">{m.name}</Txt>
          <Txt v="figureSm" style={{ color: c[onCategory[m.color]] }} numberOfLines={1} ellipsizeMode="clip">{short(cat.cents)}</Txt>
        </>
      )}
    </Animated.View>
  );
}

/**
 * What you own as category blocks, and what you owe hatched beside what is left. Widths are values.
 * `when` names the moment shown while the chart is scrubbed; `names` relabels a snapshot's coarse blocks.
 */
export function CompositionBar({ categories, ownCents, oweCents, netCents, lens, wide = false, when, names }: { categories: CategorySummary[]; ownCents: number; oweCents: number; netCents: number; lens: Lens; wide?: boolean; when?: string; names?: Partial<Record<CategoryId, string>> }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const h = wide ? 96 : 60;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Pressable onPress={() => router.push('/holdings')} accessibilityRole="link" hitSlop={8}>
          <Txt v="small" c="ink2" style={{ fontSize: 14 }}>{when ? `What you owned · ${when}` : 'What you own ›'}</Txt>
        </Pressable>
        <Txt v="figureSm" style={{ fontSize: 14 }}>{money(ownCents)}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 2, borderRadius: 10, overflow: 'hidden', minHeight: categories.length ? 0 : h, backgroundColor: categories.length ? 'transparent' : c.s1 }}>
        {categories.map((cat) => <Block key={cat.category} cat={cat} lens={lens} labelMin={wide ? 0.075 : 0.16} height={h} name={names?.[cat.category]} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 2, borderRadius: 10, overflow: 'hidden', marginTop: 2 }}>
        <Pressable onPress={() => router.push({ pathname: '/holdings/[group]', params: { group: 'debts' } })} accessibilityRole="link" style={{ flexGrow: oweCents, flexBasis: 0, height: wide ? 56 : 60, backgroundColor: c.down, overflow: 'hidden', display: oweCents > 0 ? 'flex' : 'none' }} accessibilityLabel={`Debts, ${hidden ? 'amount hidden' : money(oweCents)}. Open`}>
          {Array.from({ length: 14 }, (_, i) => (
            <View key={i} style={{ position: 'absolute', top: -20, left: -40 + i * 14, width: 7, height: 120, backgroundColor: c.downDeep, transform: [{ rotate: '45deg' }] }} />
          ))}
        </Pressable>
        <View style={{ flexGrow: Math.max(netCents, 0), flexBasis: 0, height: wide ? 56 : 60, backgroundColor: c.netBg, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 8 }}>
          <Txt v="label" c="upInk" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>Net worth</Txt>
          <Txt v="figureSm" c="upInk">{money(netCents)}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.down }} />
          <Pressable onPress={() => router.push({ pathname: '/holdings/[group]', params: { group: 'debts' } })} accessibilityRole="link" hitSlop={8}>
            <Txt v="small" c="ink2" style={{ fontSize: 14 }}>{when ? 'What you owed' : 'What you owe ›'}</Txt>
          </Pressable>
        </View>
        <Txt v="figureSm" style={{ fontSize: 14 }}>{money(oweCents)}</Txt>
      </View>
    </View>
  );
}

export const categoryName = (id: CategoryId) => meta[id].name;
