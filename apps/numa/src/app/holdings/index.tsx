import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';

import { useSession } from '@/cloud/session';
import { groupNames, groupTotal, type GroupId } from '@/data/items';
import { FOUR_CLASSES, positionsOf } from '@/data/positions';
import { useCloudItems, useDemoItems, type ItemsSource } from '@/data/useItems';
import { CATEGORY_ORDER } from '@/domain/summary';
import type { CategoryId } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import type { CategoryColor } from '@/theme/tokens';
import { categoryColor } from '@/ui/CompositionBar';
import { ItemRow } from '@/ui/ItemRow';
import { CurrencyScope, useMoney } from '@/ui/money';
import { WIDE } from '@/ui/Panel';
import { PositionRow } from '@/ui/PositionRow';
import { Screen } from '@/ui/Screen';
import { Hint } from '@/ui/Hint';
import { Treemap } from '@/ui/Treemap';
import { Txt } from '@/ui/Txt';

const ORDER: GroupId[] = [...CATEGORY_ORDER, 'debts'];
const colorOf = (g: GroupId): CategoryColor | 'down' => (g === 'debts' ? 'down' : categoryColor(g as CategoryId));
const CLASS_COLOR: Record<(typeof FOUR_CLASSES)[number]['id'], CategoryColor> = { business: 'catViolet', realEstate: 'catSlate', paper: 'catBlue', commodities: 'catAmber' };
const openGroup = (g: GroupId) => router.push({ pathname: '/holdings/[group]', params: { group: g } });

export default function HoldingsScreen() {
  return useSession().kind === 'signedIn' ? <Cloud /> : <Demo />;
}
function Cloud() { return <Holdings source={useCloudItems()} />; }
function Demo() { return <Holdings source={useDemoItems()} />; }

export function Holdings({ source, only }: { source: ItemsSource; only?: GroupId }) {
  if (source.status !== 'ready') {
    return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}>{source.status === 'error' ? <Txt v="body" c="ink2">{source.message}</Txt> : <ActivityIndicator accessibilityLabel="Loading" />}</View></Screen>;
  }
  return <CurrencyScope currency={source.currency}><Groups source={source} only={only} /></CurrencyScope>;
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 999, backgroundColor: c.s1, alignSelf: 'flex-start' }} accessibilityRole="tablist">
      {options.map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" aria-selected={value === k} style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: value === k ? c.s2 : 'transparent' }}>
          <Txt v="small" style={{ fontFamily: 'Manrope_600SemiBold', color: value === k ? c.ink : c.ink2 }}>{label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

function Groups({ source, only }: { source: Extract<ItemsSource, { status: 'ready' }>; only?: GroupId }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const wide = useWindowDimensions().width >= WIDE;
  const [view, setView] = useState<'kind' | 'classes'>('kind');
  const groups = (only ? [only] : ORDER).map((g) => ({ g, items: source.items.filter((i) => i.group === g) })).filter((x) => x.items.length > 0 || x.g === only);
  const single = only ? groups[0] : null;
  const total = single ? groupTotal(single.items) : null;
  const positions = only ? positionsOf(source.items, only) : [];
  const owned = groups.filter((x) => x.g !== 'debts');
  const ownedCents = owned.reduce((t, x) => t + groupTotal(x.items).cents, 0);
  const swatch = (g: GroupId) => (g === 'debts' ? c.down : c[categoryColor(g as CategoryId)]);

  return (
    <Screen back={only ? 'Back' : 'Home'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Txt v="title" accessibilityRole="header" style={{ flexShrink: 1 }}>{only ? groupNames[only] : 'Holdings'}</Txt>
        {source.demo && <View style={{ minHeight: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}><Txt v="label" c="ink2" style={{ fontSize: 10 }}>Demo data</Txt></View>}
      </View>
      {single && total && (
        <View style={{ marginTop: 10 }}>
          <Txt v="figure" style={{ fontSize: 34, lineHeight: 40, color: only === 'debts' ? c.down : c.ink }}>{money(total.cents, { cents: true })}</Txt>
          {total.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 4 }}>{total.unknown} without a value {total.unknown === 1 ? 'is' : 'are'} left out of this total.</Txt>}
        </View>
      )}

      {/* The overview: what you own as areas, by kind or by Kiyosaki's four asset classes. */}
      {!only && owned.length > 0 && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Toggle value={view} onChange={setView} options={[['kind', 'By kind'], ['classes', 'Four asset classes']]} />
          {view === 'kind' ? (
            <Treemap height={wide ? 260 : 200} tiles={owned.map((x) => ({ id: x.g, label: groupNames[x.g], cents: groupTotal(x.items).cents, color: colorOf(x.g), onPress: () => openGroup(x.g) }))} />
          ) : (
            <>
              <Treemap height={wide ? 260 : 200} tiles={FOUR_CLASSES.map((k) => ({ id: k.id, label: k.name, cents: owned.filter((x) => k.groups.includes(x.g)).reduce((t, x) => t + groupTotal(x.items).cents, 0), color: CLASS_COLOR[k.id] }))} />
              {FOUR_CLASSES.map((k) => {
                const cents = owned.filter((x) => k.groups.includes(x.g)).reduce((t, x) => t + groupTotal(x.items).cents, 0);
                return (
                  <View key={k.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c[CLASS_COLOR[k.id]] }} />
                      <Txt v="body" style={{ flex: 1, fontFamily: 'Manrope_600SemiBold' }}>{k.name}</Txt>
                      <Txt v="figureSm" style={{ fontSize: 14 }}>{money(cents)}</Txt>
                      <Txt v="figureSm" c="ink3" style={{ width: 40, textAlign: 'right' }}>{ownedCents > 0 ? `${Math.round((cents / ownedCents) * 100)}%` : ''}</Txt>
                    </View>
                    <Txt v="small" c="ink3">{k.note}</Txt>
                  </View>
                );
              })}
              <Txt v="small" c="ink3">The four asset classes from Robert Kiyosaki’s Rich Dad books. Debts are not in them: they are below, under What you owe.</Txt>
            </>
          )}
        </View>
      )}

      {/* One group: its assets as areas, then each asset with where it sits. */}
      {single && positions.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Treemap height={wide ? 240 : 190} tiles={positions.filter((p) => (p.valueCents ?? 0) > 0).map((p) => ({ id: p.key, label: p.name, cents: p.valueCents ?? 0, color: colorOf(only!), onPress: () => router.push({ pathname: '/position/[group]/[key]', params: { group: only!, key: p.key } }) }))} />
          <Txt v="label" c="ink3" style={{ marginTop: 22 }} accessibilityRole="header">{only === 'cash' ? 'BY CURRENCY' : only === 'debts' ? 'BY DEBT' : 'BY ASSET'}</Txt>
          {positions.map((p, n) => <PositionRow key={p.key} position={p} share={total && total.cents > 0 && p.valueCents !== null ? p.valueCents / total.cents : null} swatch={swatch(only!)} last={n === positions.length - 1} />)}
          <Txt v="label" c="ink3" style={{ marginTop: 26 }} accessibilityRole="header">RECORDS</Txt>
        </View>
      )}

      {groups.length > 0 && !source.demo && <Hint id="holdings-open" text="Tap any row to see where its value comes from, and to edit or delete it." />}
      {groups.length === 0 && <Txt v="body" c="ink2" style={{ marginTop: 20 }}>Nothing here yet. Tap the plus to add an account, a holding or a debt.</Txt>}
      {single && single.items.length === 0 && <Txt v="body" c="ink2" style={{ marginTop: 20 }}>Nothing in {groupNames[single.g].toLowerCase()} yet.</Txt>}
      {groups.map(({ g, items }) => {
        const t = groupTotal(items);
        return (
          <View key={g} style={{ marginTop: only ? 4 : 28 }}>
            {!only && (
              <Link href={{ pathname: '/holdings/[group]', params: { group: g } }} asChild>
                <Pressable accessibilityRole="link" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 36 }}>
                  <Txt v="section">{groupNames[g]}</Txt>
                  <Txt v="figureSm" style={{ fontSize: 14, color: g === 'debts' ? c.down : c.ink }}>{money(t.cents)}</Txt>
                </Pressable>
              </Link>
            )}
            {items.map((i, n) => <ItemRow key={i.id} item={i} last={n === items.length - 1} />)}
          </View>
        );
      })}
    </Screen>
  );
}
