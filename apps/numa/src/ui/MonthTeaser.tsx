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
      <Pressable accessibilityRole="link" accessibilityLabel={nothing ? `${month}: nothing logged yet. Open Flow` : hidden ? `${month} cash flow, amounts hidden. Open Flow` : `${month} cash flow: in ${money(flow.inCents)}, out ${money(flow.outCents)}, ${kept ? 'kept' : 'overspent'} ${money(Math.abs(flow.keptCents))}. Open Flow`} style={{ padding: 16, borderRadius: 20, backgroundColor: c.s1 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12 }}>
          <Txt v="cardTitle">{month} so far</Txt>
          {nothing ? (
            <Txt v="small" c="ink2">Nothing logged yet</Txt>
          ) : kept ? (
            <Txt v="figureSm" c="upInk">kept {money(flow.keptCents)} · {mask(String(Math.round(flow.keptShare * 100)))}%</Txt>
          ) : (
            <Txt v="figureSm" style={{ color: c.down }}>{money(-flow.keptCents)} more out than in</Txt>
          )}
        </View>
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <View style={{ flexGrow: flow.outCents, flexBasis: 0, backgroundColor: c.ink3 }} />
          <View style={{ flexGrow: Math.max(flow.keptCents, 0), flexBasis: 0, backgroundColor: c.up }} />
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12 }}>
          <Txt v="figureSm" c="ink2">in {money(flow.inCents)}</Txt>
          <Txt v="figureSm" c="ink2">out {money(flow.outCents)}</Txt>
        </View>
      </Pressable>
    </Link>
  );
}
