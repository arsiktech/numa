import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSession } from '@/cloud/session';
import { groupNames, groupTotal, type GroupId } from '@/data/items';
import { useCloudItems, useDemoItems, type ItemsSource } from '@/data/useItems';
import { CATEGORY_ORDER } from '@/domain/summary';
import { useTheme } from '@/theme/theme';
import { ItemRow } from '@/ui/ItemRow';
import { CurrencyScope, useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

const ORDER: GroupId[] = [...CATEGORY_ORDER, 'debts'];

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

function Groups({ source, only }: { source: Extract<ItemsSource, { status: 'ready' }>; only?: GroupId }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const groups = (only ? [only] : ORDER).map((g) => ({ g, items: source.items.filter((i) => i.group === g) })).filter((x) => x.items.length > 0 || x.g === only);
  const single = only ? groups[0] : null;
  const total = single ? groupTotal(single.items) : null;
  return (
    <Screen back={only ? 'Back' : 'Home'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Txt v="title" accessibilityRole="header" style={{ flexShrink: 1 }}>{only ? groupNames[only] : 'Holdings'}</Txt>
        {source.demo && <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}><Txt v="label" c="ink2" style={{ fontSize: 10 }}>Demo data</Txt></View>}
      </View>
      {single && total && (
        <View style={{ marginTop: 10 }}>
          <Txt v="figure" style={{ fontSize: 34, lineHeight: 40, color: only === 'debts' ? c.down : c.ink }}>{money(total.cents, { cents: true })}</Txt>
          {total.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 4 }}>{total.unknown} without a value {total.unknown === 1 ? 'is' : 'are'} left out of this total.</Txt>}
        </View>
      )}
      {groups.length === 0 && <Txt v="body" c="ink2" style={{ marginTop: 20 }}>Nothing here yet. Tap the plus to add an account, a holding or a debt.</Txt>}
      {single && single.items.length === 0 && <Txt v="body" c="ink2" style={{ marginTop: 20 }}>Nothing in {groupNames[single.g].toLowerCase()} yet.</Txt>}
      {groups.map(({ g, items }) => {
        const t = groupTotal(items);
        return (
          <View key={g} style={{ marginTop: only ? 18 : 28 }}>
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
