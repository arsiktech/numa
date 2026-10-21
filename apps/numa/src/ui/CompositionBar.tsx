import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { Item } from '@/data/items';
import type { CategorySummary } from '@/domain/summary';
import type { CategoryId } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { onCategory, type CategoryColor } from '@/theme/tokens';
import { LensBar, type BarEntry } from './LensBar';
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

/** Where a block or row leads; by default, today's items in that group. */
export type OpenTarget = CategoryId | 'debts' | 'all';
const openToday = (to: OpenTarget) => (to === 'all' ? router.push('/holdings') : router.push({ pathname: '/holdings/[group]', params: { group: to } }));

/** `when`, `names` and `onOpen` retain the chart's historical split and navigation. */
export function CompositionBar({ categories, ownCents, oweCents, netCents, lens, wide = false, when, names, onOpen, items = [] }: {
  categories: CategorySummary[]; ownCents: number; oweCents: number; netCents: number; lens: Lens;
  wide?: boolean; when?: string; names?: Partial<Record<CategoryId, string>>; onOpen?: (to: OpenTarget) => void; items?: Item[];
}) {
  const open = onOpen ?? openToday;
  const { c } = useTheme();
  const { money, short, mask } = useMoney();
  const includes = (group: Item['group']) => {
    if (when) return onOpen ? 'Item values at this date are not available here. Open the date’s details for its saved records.'
      : 'Historical split; item values are not available here. Opening a group shows today’s records.';
    const rows = items.filter((i) => i.group === group && (i.type !== 'wallet' || i.raw && 'includeInNetWorth' in i.raw && i.raw.includeInNetWorth))
      .sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1));
    if (!rows.length) return 'Open the group to see its records.';
    return rows.slice(0, 3).map((i) => `${mask(i.name)} ${i.valueCents !== null && Number.isFinite(i.valueCents) ? short(Math.round(i.valueCents)) : 'Unavailable'}`).join(' · ') + (rows.length > 3 ? ` · +${rows.length - 3} more` : '');
  };
  const own: BarEntry[] = categories.map((cat) => {
    const m = meta[cat.category];
    const counts = lens === 'net' || (lens === 'liquid' ? cat.liquidCents : cat.cashCents) > 0;
    return { id: cat.category, name: names?.[cat.category] ?? m.name, cents: cat.cents, fill: c[m.color], ink: c[onCategory[m.color]], opacity: counts ? 1 : 0.18, detail: includes(cat.category), onPress: () => open(cat.category) };
  });
  const balance: BarEntry[] = [
    { id: 'debts', name: 'What you owe', cents: oweCents, fill: c.down, ink: '#FFFFFF', hatch: c.downDeep, detail: includes('debts'), onPress: () => open('debts') },
    { id: 'net', name: 'Net worth', cents: netCents, fill: c.netBg, ink: c.upInk, fullAmount: true, detail: when ? `Net worth · ${when}` : 'What you own less what you owe.' },
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, marginBottom: 8 }}>
        <Pressable onPress={() => open('all')} accessibilityRole="link" hitSlop={8}>
          <Txt v="small" c="ink2" style={{ fontSize: 14 }}>{when ? `What you owned · ${when}${onOpen ? ' ›' : ''}` : 'What you own ›'}</Txt>
        </Pressable>
        <Txt v="figureSm" style={{ fontSize: 14 }}>{money(ownCents)}</Txt>
      </View>
      <View style={{ gap: 2 }}>
        <LensBar entries={own} height={wide ? 96 : 60} labelMin={wide ? 0.075 : 0.16} emptyColor={c.s1} />
        <LensBar entries={balance} height={wide ? 56 : 60} labelMin={0.16} emptyColor={c.s1} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.down }} />
          <Pressable onPress={() => open('debts')} accessibilityRole="link" hitSlop={8}>
            <Txt v="small" c="ink2" style={{ fontSize: 14 }}>{when ? `What you owed${onOpen ? ' ›' : ''}` : 'What you owe ›'}</Txt>
          </Pressable>
        </View>
        <Txt v="figureSm" style={{ fontSize: 14 }}>{money(oweCents)}</Txt>
      </View>
    </View>
  );
}

export const categoryName = (id: CategoryId) => meta[id].name;
export const categoryColor = (id: CategoryId): CategoryColor => meta[id].color;
