import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { Item } from '@/data/items';
import type { Tone } from '@/domain/freshness';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { useMoney } from './money';
import { Txt } from './Txt';

export const toneColor: Record<Tone, keyof Palette> = { live: 'up', ok: 'ink3', stale: 'warn', missing: 'warn', due: 'down' };

/** One record: name and what it is on the left, value and change on the right, freshness under it. */
export function ItemRow({ item, last }: { item: Item; last?: boolean }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const change = item.changeTodayCents;
  return (
    <Link href={{ pathname: '/item/[type]/[id]', params: { type: item.type, id: item.id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${item.name}, ${item.valueCents === null ? 'no value' : hidden ? 'amount hidden' : money(item.valueCents)}. ${item.freshness.text}`}
        style={{ minHeight: 64, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{item.name}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c[toneColor[item.freshness.tone]] }} />
            <Txt v="small" c="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>{[item.detail, item.freshness.text].filter(Boolean).join(' · ')}</Txt>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="figure" style={{ fontSize: 15 }}>{item.valueCents === null ? '—' : money(item.valueCents)}</Txt>
          {change ? <Txt v="figureSm" style={{ color: change >= 0 ? c.upInk : c.down }}>{(change >= 0 ? '+' : '−') + money(Math.abs(change)).replace('−', '')}</Txt> : null}
        </View>
      </Pressable>
    </Link>
  );
}
