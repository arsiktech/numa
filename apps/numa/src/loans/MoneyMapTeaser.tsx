import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';
import { useMoneyMap } from './useMoneyMap';

/** On Home: who owes whom at a glance, opening the money map. Signed-in only. */
export function MoneyMapTeaser() {
  const { c } = useTheme();
  const { money } = useMoney();
  const state = useMoneyMap();
  if (state.status !== 'ready') return null;
  const { map } = state;
  if (!map.owedToYou.length && !map.people.length && !map.protocols.length) return null;
  return (
    <Pressable onPress={() => router.push('/money-map')} accessibilityRole="link"
      accessibilityLabel={`Money map. Owed to you ${money(map.owedToYouCents)}, you owe ${money(map.youOweCents)}. Open`}
      style={{ backgroundColor: c.s1, borderRadius: 18, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt v="cardTitle">Money map</Txt>
        <Txt v="body" c="ink3">›</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="small" c="ink2">Owed to you</Txt>
          <Txt v="figure" style={{ fontSize: 17, color: c.upInk }}>{money(map.owedToYouCents)}</Txt>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="small" c="ink2">You owe</Txt>
          <Txt v="figure" style={{ fontSize: 17, color: c.down }}>{money(map.youOweCents)}</Txt>
        </View>
      </View>
      <Txt v="small" c="ink3" numberOfLines={1}>{[...map.people, ...map.owedToYou].slice(0, 4).map((p) => p.name).join(', ')}{map.protocols.length ? ` and ${map.protocols.length} protocol${map.protocols.length === 1 ? '' : 's'}` : ''}</Txt>
    </Pressable>
  );
}
