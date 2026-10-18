import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSession } from '@/cloud/session';
import { groupNames, type GroupId } from '@/data/items';
import { positionsOf, type Place, type Position } from '@/data/positions';
import { useCloudItems, useDemoItems, type ItemsSource } from '@/data/useItems';
import type { CategoryId } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { categoryColor } from '@/ui/CompositionBar';
import { CurrencyScope, useMoney } from '@/ui/money';
import { quantityText } from '@/ui/PositionRow';
import { PriceChart } from '@/ui/PriceChart';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

const TAGS: Record<NonNullable<Place['tag']>, string> = { pledged: 'Pledged', lent: 'Lent out', locked: 'Locked', pool: 'In a pool' };

/** One asset across everywhere it sits: each wallet address and network, exchange account and record. */
export default function PositionScreen() {
  const { group, key } = useLocalSearchParams<{ group: string; key: string }>();
  const signedIn = useSession().kind === 'signedIn';
  if (!(group in groupNames)) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>That group doesn’t exist.</Txt></Screen>;
  return signedIn ? <Cloud group={group as GroupId} id={key} /> : <Demo group={group as GroupId} id={key} />;
}
function Cloud({ group, id }: { group: GroupId; id: string }) { return <Body source={useCloudItems()} group={group} id={id} />; }
function Demo({ group, id }: { group: GroupId; id: string }) { return <Body source={useDemoItems()} group={group} id={id} />; }

function Body({ source, group, id }: { source: ItemsSource; group: GroupId; id: string }) {
  if (source.status !== 'ready') {
    return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}>{source.status === 'error' ? <Txt v="body" c="ink2">{source.message}</Txt> : <ActivityIndicator accessibilityLabel="Loading" />}</View></Screen>;
  }
  const position = positionsOf(source.items, group).find((p) => p.key === id);
  if (!position) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>This is no longer in {groupNames[group].toLowerCase()}.</Txt></Screen>;
  return <CurrencyScope currency={source.currency}><Detail position={position} demo={source.demo} now={source.now} /></CurrencyScope>;
}

function Detail({ position, demo, now }: { position: Position; demo: boolean; now: number }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  const color = position.group === 'debts' ? c.down : c[categoryColor(position.group as CategoryId)];
  const known = position.places.filter((p) => (p.valueCents ?? 0) > 0);
  const total = position.valueCents ?? 0;
  const qty = quantityText(position.quantity, position.unit);
  return (
    <Screen>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>{groupNames[position.group].toUpperCase()}{demo ? ' · DEMO DATA' : ''}</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>{position.name}</Txt>
      <Txt v="figure" style={{ marginTop: 10, fontSize: 34, lineHeight: 40, color: position.group === 'debts' ? c.down : c.ink }}>{position.valueCents === null ? '—' : money(position.valueCents, { cents: true })}</Txt>
      {qty && <Txt v="body" c="ink2" style={{ marginTop: 4 }}>{mask(qty)}</Txt>}
      {position.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 4 }}>{position.unknown} {position.unknown === 1 ? 'place has' : 'places have'} no value yet and {position.unknown === 1 ? 'is' : 'are'} left out of this total.</Txt>}
      {/* A coin or a stock has a market price; cash, pools, lending and plain records don't. */}
      {!demo && (position.group === 'crypto' || position.group === 'stocks') && /^[A-Z0-9.-]{1,15}$/.test(position.key) && (
        <PriceChart symbol={position.key} kind={position.group === 'crypto' ? 'crypto' : 'stock'} now={now} />
      )}

      <Txt v="label" c="ink3" style={{ marginTop: 24 }} accessibilityRole="header">WHERE IT IS</Txt>
      {/* The split as one bar: each place's width is its share. */}
      {known.length > 1 && total > 0 && (
        <View style={{ flexDirection: 'row', gap: 2, height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 10 }} accessibilityLabel={known.map((p) => `${p.where} ${Math.round(((p.valueCents ?? 0) / total) * 100)} percent`).join(', ')}>
          {known.map((p, i) => <View key={p.itemId + i} style={{ flexGrow: p.valueCents ?? 0, flexBasis: 0, backgroundColor: color, opacity: Math.max(0.4, 1 - i * 0.2) }} />)}
        </View>
      )}
      {position.places.map((p, i) => (
        <Pressable key={p.itemId + i} onPress={() => router.push({ pathname: '/item/[type]/[id]', params: { type: p.itemType, id: p.itemId } })} accessibilityRole="link"
          accessibilityLabel={`${p.where}${p.detail ? `, ${p.detail}` : ''}, ${p.valueCents === null ? 'no value' : money(p.valueCents)}. Open the record`}
          style={{ minHeight: 64, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === position.places.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, opacity: (p.valueCents ?? 0) > 0 ? Math.max(0.4, 1 - known.indexOf(p) * 0.2) : 0.2 }} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold', flexShrink: 1 }} numberOfLines={1}>{p.where}</Txt>
              {p.tag && <View style={{ paddingHorizontal: 7, minHeight: 20, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}><Txt v="label" c="ink2" style={{ fontSize: 10 }}>{TAGS[p.tag]}</Txt></View>}
            </View>
            {p.detail && <Txt v="small" c="ink2" selectable numberOfLines={2}>{p.detail}</Txt>}
            {quantityText(p.quantity, p.unit) && <Txt v="small" c="ink3">{mask(quantityText(p.quantity, p.unit)!)}</Txt>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="figure" style={{ fontSize: 15 }}>{p.valueCents === null ? '—' : money(p.valueCents)}</Txt>
            {total > 0 && p.valueCents !== null && position.places.length > 1 && <Txt v="figureSm" c="ink3">{Math.round((p.valueCents / total) * 100)}%</Txt>}
          </View>
          <Txt v="body" c="ink3">›</Txt>
        </Pressable>
      ))}
    </Screen>
  );
}
