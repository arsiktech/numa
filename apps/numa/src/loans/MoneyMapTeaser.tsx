import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';
import { useMoney } from '@/ui/money';
import { TeaserCard } from '@/ui/TeaserCard';
import { Txt } from '@/ui/Txt';
import { useMoneyMap } from './useMoneyMap';

/** On Home: who owes whom at a glance, opening the money map. Signed-in only. */
export function MoneyMapTeaser({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const state = useMoneyMap();
  if (state.status !== 'ready') return null;
  const { map } = state;
  if (!map.owedToYou.length && !map.people.length && !map.protocols.length) return null;
  const who = [...map.people, ...map.owedToYou].slice(0, 4).map((p) => p.name).join(', ')
    + (map.protocols.length ? ` and ${map.protocols.length} protocol${map.protocols.length === 1 ? '' : 's'}` : '');
  return (
    <TeaserCard title="Money map" href="/money-map" style={style}
      accessibilityLabel={`Money map. Owed to you ${money(map.owedToYouCents)}, you owe ${money(map.youOweCents)}. Open`}>
      <View style={{ flexDirection: 'row', gap: space[4] }}>
        <View style={{ flex: 1 }}>
          <Txt v="small" c="ink2">Owed to you</Txt>
          <Txt v="figure">{money(map.owedToYouCents)}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="small" c="ink2">You owe</Txt>
          <Txt v="figure" style={{ color: c.down }}>{money(map.youOweCents)}</Txt>
        </View>
      </View>
      <Txt v="small" c="ink2" numberOfLines={1}>{who}</Txt>
    </TeaserCard>
  );
}
