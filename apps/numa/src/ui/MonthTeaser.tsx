import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { FlowSummary } from '@/domain/flow';
import { formatMoney } from '@/domain/money';
import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

export function MonthTeaser({ month, flow }: { month: string; flow: FlowSummary }) {
  const { c } = useTheme();
  return (
    <Link href="/flow" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${month} cash flow: in ${formatMoney(flow.inCents)}, out ${formatMoney(flow.outCents)}, kept ${formatMoney(flow.keptCents)}. Open Flow`} style={{ padding: 16, borderRadius: 20, backgroundColor: c.s1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt v="cardTitle">{month} so far</Txt>
          <Txt v="figureSm" c="upInk">kept {formatMoney(flow.keptCents)} · {Math.round(flow.keptShare * 100)}%</Txt>
        </View>
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <View style={{ flexGrow: flow.outCents, flexBasis: 0, backgroundColor: c.ink3 }} />
          <View style={{ flexGrow: Math.max(flow.keptCents, 0), flexBasis: 0, backgroundColor: c.up }} />
        </View>
        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="figureSm" c="ink2">in {formatMoney(flow.inCents)}</Txt>
          <Txt v="figureSm" c="ink2">out {formatMoney(flow.outCents)}</Txt>
        </View>
      </Pressable>
    </Link>
  );
}
