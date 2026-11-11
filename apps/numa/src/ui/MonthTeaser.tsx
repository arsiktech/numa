import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { FlowSummary } from '@/domain/flow';
import { useTheme } from '@/theme/theme';
import { useMoney } from './money';
import { Txt } from './Txt';

export function MonthTeaser({ month, flow }: { month: string; flow: FlowSummary }) {
  const { c } = useTheme();
  const { money, hidden, mask } = useMoney();
  const nothing = flow.inCents === 0 && flow.outCents === 0;
  const kept = flow.keptCents >= 0;
  return (
    <Link href="/flow" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={nothing ? `${month} so far. Nothing logged yet` : hidden ? `${month} so far. Amounts hidden` : `${month} so far. In ${money(flow.inCents)}, out ${money(flow.outCents)}`} style={({ pressed }) => ({ padding: 16, borderRadius: 18, backgroundColor: c.s1, opacity: pressed ? 0.72 : 1 })}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12 }}>
          <Txt v="cardTitle">{month} so far</Txt>
          {nothing ? (
            <Txt v="small" c="ink2">Nothing logged yet</Txt>
          ) : kept ? (
            <Txt fbPrivate v="figureSm" c="upInk">kept {money(flow.keptCents)} · {mask(String(Math.round(flow.keptShare * 100)))}%</Txt>
          ) : (
            <Txt fbPrivate v="figureSm" style={{ color: c.down }}>{money(-flow.keptCents)} more out than in</Txt>
          )}
        </View>
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <View style={{ flexGrow: flow.outCents, flexBasis: 0, backgroundColor: c.ink3 }} />
          <View style={{ flexGrow: Math.max(flow.keptCents, 0), flexBasis: 0, backgroundColor: c.up }} />
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12 }}>
          <Txt fbPrivate v="figureSm" c="ink2">in {money(flow.inCents)}</Txt>
          <Txt fbPrivate v="figureSm" c="ink2">out {money(flow.outCents)}</Txt>
        </View>
      </Pressable>
    </Link>
  );
}
