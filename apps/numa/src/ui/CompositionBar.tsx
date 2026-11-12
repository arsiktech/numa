import { router } from 'expo-router';
import { Pressable, View, type DimensionValue } from 'react-native';

import type { Item } from '@/data/items';
import type { CategorySummary } from '@/domain/summary';
import type { CategoryId } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { space, type CategoryColor } from '@/theme/tokens';
import { barShares } from './lens';
import { LensBar, type BarEntry } from './LensBar';
import { useMoney } from './money';
import { Txt } from './Txt';

export type Lens = 'net' | 'liquid' | 'cash';

// Category colours stay for the holdings lists. Home's bar draws owned blocks in the surface tone,
// debts in the alert colour, and net worth as the unfilled rest of the debt row.
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

const pct = (share: number): DimensionValue => `${Math.max(share * 100, 2)}%`;

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
    return { id: cat.category, name: names?.[cat.category] ?? m.name, cents: cat.cents, fill: c.s2, ink: c.ink, opacity: counts ? 1 : 0.4, detail: includes(cat.category), onPress: () => open(cat.category) };
  });
  const balance: BarEntry[] = [
    { id: 'debts', name: 'What you owe', cents: oweCents, fill: c.down, ink: c.bg, quiet: true, detail: includes('debts'), onPress: () => open('debts') },
    { id: 'net', name: 'Net worth', cents: netCents, fill: c.bg, ink: c.ink2, fullAmount: true, detail: when ? `Net worth · ${when}` : 'What you own less what you owe.' },
  ];
  const shares = barShares(ownCents, oweCents, netCents);
  const header = (label: string, cents: number, to: OpenTarget) => (
    <Pressable onPress={() => open(to)} accessibilityRole="link" hitSlop={8}
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: space[3], marginBottom: space[2] }}>
      <Txt v="small" c="ink2">{label}</Txt>
      <Txt v="figureSm">{money(cents)}</Txt>
    </Pressable>
  );
  return (
    <View style={{ gap: space[4] }}>
      <View>
        {header(when ? `What you owned · ${when}${onOpen ? ' ›' : ''}` : 'What you own ›', ownCents, 'all')}
        <View style={{ width: pct(shares.own) }}>
          <LensBar entries={own} height={wide ? 64 : 56} labelMin={wide ? 0.06 : 0.15} emptyColor={c.s2} />
        </View>
      </View>
      <View>
        {header(when ? `What you owed${onOpen ? ' ›' : ''}` : 'What you owe ›', oweCents, 'debts')}
        <View style={{ width: pct(shares.balance) }}>
          <LensBar entries={balance} height={48} labelMin={0.1} emptyColor={c.s2} />
        </View>
      </View>
    </View>
  );
}

export const categoryName = (id: CategoryId) => meta[id].name;
export const categoryColor = (id: CategoryId): CategoryColor => meta[id].color;
