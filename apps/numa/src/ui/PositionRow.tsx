import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { Family, Position } from '@/data/positions';
import { useTheme } from '@/theme/theme';
import { useMoney } from './money';
import { Txt } from './Txt';

export const amountText = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Math.round(n * 1e8) / 1e8));
export const quantityText = (q: number | null, unit: string | null) => (q === null || !unit ? null : `${amountText(q)} ${unit}`);

/** One asset in a group: how much, where it sits, and its share. Opens where exactly. */
export function PositionRow({ position, share, swatch, last }: { position: Position; share: number | null; swatch: string; last?: boolean }) {
  const { c } = useTheme();
  const { money, mask, hidden } = useMoney();
  const places = position.places.length;
  const where = places === 1 ? position.places[0].where : `${places} places`;
  const qty = quantityText(position.quantity, position.unit);
  return (
    <Link href={{ pathname: '/position/[group]/[key]', params: { group: position.group, key: position.key } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${position.name}, ${position.valueCents === null ? 'no value' : hidden ? 'amount hidden' : money(position.valueCents)}, ${where}. Open`}
        style={{ minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{position.name}</Txt>
          <Txt v="small" c="ink2" numberOfLines={1}>{[qty && mask(qty), where].filter(Boolean).join(' · ')}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="figure" style={{ fontSize: 15 }}>{position.valueCents === null ? '—' : money(position.valueCents)}</Txt>
          {share !== null && <Txt v="figureSm" c="ink3">{Math.round(share * 100)}%</Txt>}
        </View>
        <Txt v="body" c="ink3">›</Txt>
      </Pressable>
    </Link>
  );
}

/** Versions of one underlying asset, like cbBTC, WBTC and tBTC as Bitcoin. Opens the versions. */
export function FamilyRow({ family, group, share, swatch, last }: { family: Family; group: string; share: number | null; swatch: string; last?: boolean }) {
  const { c } = useTheme();
  const { money, mask, hidden } = useMoney();
  const qty = quantityText(family.quantity, family.unit);
  const versions = family.members.map((m) => m.unit ?? m.name).join(', ');
  return (
    <Link href={{ pathname: '/position/[group]/[key]', params: { group, key: family.key } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${family.name}, ${family.valueCents === null ? 'no value' : hidden ? 'amount hidden' : money(family.valueCents)}, ${group === 'debts' ? 'owed as' : 'held as'} ${versions}. Open`}
        style={{ minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{family.name}</Txt>
          <Txt v="small" c="ink2" numberOfLines={1}>{[qty && mask(qty), versions].filter(Boolean).join(' · ')}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="figure" style={{ fontSize: 15 }}>{family.valueCents === null ? '—' : money(family.valueCents)}</Txt>
          {share !== null && <Txt v="figureSm" c="ink3">{Math.round(share * 100)}%</Txt>}
        </View>
        <Txt v="body" c="ink3">›</Txt>
      </Pressable>
    </Link>
  );
}
