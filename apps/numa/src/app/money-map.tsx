import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSession } from '@/cloud/session';
import type { MoneyMap, Party, Spot } from '@/data/moneyMap';
import { useMoneyMap } from '@/loans/useMoneyMap';
import { useTheme } from '@/theme/theme';
import type { Palette } from '@/theme/tokens';
import { CurrencyScope, useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

/** Who you owe, who owes you, and where your own money sits. */
export default function MoneyMapScreen() {
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to see your money map.</Txt></Screen>;
  return <Cloud />;
}

function Cloud() {
  const state = useMoneyMap();
  if (state.status !== 'ready') return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View></Screen>;
  return <CurrencyScope currency={state.currency}><Map map={state.map} /></CurrencyScope>;
}

export const openParty = (key: string) => router.push({ pathname: '/person/[key]', params: { key } });

function Row({ dot, name, tag, detail, cents, onPress, last }: { dot: keyof Palette; name: string; tag?: string; detail: string; cents: number | null; onPress?: () => void; last: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={`${name}, ${cents === null ? 'no value' : money(cents)}. ${detail}`}
      style={{ minHeight: 56, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: last ? 0 : 0, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line2 }}>
      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c[dot] as string }} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold', flexShrink: 1 }} numberOfLines={1}>{name}</Txt>
          {tag && <View style={{ paddingHorizontal: 7, minHeight: 20, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}><Txt v="label" c="ink2" style={{ fontSize: 10 }}>{tag}</Txt></View>}
        </View>
        <Txt v="small" c="ink2" numberOfLines={1}>{detail}</Txt>
      </View>
      <Txt v="figureSm" style={{ fontSize: 14 }}>{cents === null ? '—' : money(cents)}</Txt>
      {onPress && <Txt v="body" c="ink3">›</Txt>}
    </Pressable>
  );
}

function Card({ title, cents, tone, children }: { title: string; cents: number; tone: 'up' | 'down' | 'ink'; children: React.ReactNode }) {
  const { c } = useTheme();
  const { money } = useMoney();
  return (
    <View style={{ marginTop: 14, backgroundColor: c.s1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Txt v="cardTitle" accessibilityRole="header">{title}</Txt>
        <Txt v="figure" style={{ fontSize: 16, color: tone === 'up' ? c.upInk : tone === 'down' ? c.down : c.ink }}>{money(cents)}</Txt>
      </View>
      {children}
    </View>
  );
}

const partyRows = (xs: Party[], dot: keyof Palette) => xs.map((p, i) => <Row key={p.key} dot={dot} name={p.name} detail={p.detail} cents={p.cents} onPress={() => openParty(p.key)} last={i === xs.length - 1} />);
const spotRows = (xs: Spot[]) => xs.map((s, i) => (
  <Row key={s.key} dot={s.key.startsWith('wallet:') ? 'catViolet' : 'catSand'} name={s.name} tag={s.pledged ? 'pledged' : undefined} detail={s.detail} cents={s.cents}
    onPress={s.open ? () => router.push(s.open as never) : s.key.startsWith('group:') ? () => router.push({ pathname: '/holdings/[group]', params: { group: s.key.slice(6) } }) : undefined} last={i === xs.length - 1} />
));

function Map({ map }: { map: MoneyMap }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const total = map.ownCents + map.owedToYouCents + map.youOweCents;
  return (
    <Screen>
      <Txt v="label" c="ink3" style={{ marginTop: 6 }}>MONEY MAP</Txt>
      <Txt v="figure" accessibilityRole="header" style={{ marginTop: 6, fontSize: 40, lineHeight: 46 }}>{money(map.netCents, { cents: true })}</Txt>
      <Txt v="body" c="ink2">What’s left after every debt is paid</Txt>
      {total > 0 && (
        <View accessibilityLabel={`Yours ${money(map.ownCents)}, owed to you ${money(map.owedToYouCents)}, you owe ${money(map.youOweCents)}`}>
          <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, marginTop: 16 }}>
            {map.ownCents > 0 && <View style={{ flexGrow: map.ownCents, flexBasis: 0, backgroundColor: c.up }} />}
            {map.owedToYouCents > 0 && <View style={{ flexGrow: map.owedToYouCents, flexBasis: 0, backgroundColor: c.catBlue }} />}
            {map.youOweCents > 0 && <View style={{ flexGrow: map.youOweCents, flexBasis: 0, backgroundColor: c.down }} />}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
            <Txt v="small" c="ink2">Yours {money(map.ownCents)}</Txt>
            <Txt v="small" c="ink2">Owed to you {money(map.owedToYouCents)}</Txt>
            <Txt v="small" c="ink2">You owe {money(map.youOweCents)}</Txt>
          </View>
        </View>
      )}
      {map.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 8 }}>{map.unknown} without a value {map.unknown === 1 ? 'is' : 'are'} left out.</Txt>}

      <Card title="Owed to you" cents={map.owedToYouCents} tone="up">
        {map.owedToYou.length ? partyRows(map.owedToYou, 'catBlue') : <Txt v="body" c="ink2" style={{ paddingBottom: 10 }}>Nobody owes you money. When you lend some, add it as an asset and say who owes it.</Txt>}
      </Card>

      <Card title="You owe" cents={map.youOweCents} tone="down">
        {map.people.length > 0 && <Txt v="label" c="ink3" style={{ marginTop: 4 }}>PEOPLE</Txt>}
        {partyRows(map.people, 'down')}
        {map.protocols.length > 0 && <Txt v="label" c="ink3" style={{ marginTop: 10 }}>PROTOCOLS</Txt>}
        {partyRows(map.protocols, 'down')}
        {!map.people.length && !map.protocols.length && <Txt v="body" c="ink2" style={{ paddingBottom: 10 }}>You owe nothing.</Txt>}
      </Card>

      <Card title="Where it sits" cents={map.ownCents} tone="ink">{spotRows(map.spots)}</Card>
    </Screen>
  );
}
