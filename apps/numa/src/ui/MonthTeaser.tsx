import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { FlowSummary } from '@/domain/flow';
import { useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';
import { useMoney } from './money';
import { TeaserCard } from './TeaserCard';
import { Txt } from './Txt';

/** The month so far: what came in, what went out, and what was kept. Opens Flow. */
export function MonthTeaser({ month, flow, style }: { month: string; flow: FlowSummary; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const { money, hidden, mask } = useMoney();
  const nothing = flow.inCents === 0 && flow.outCents === 0;
  const kept = flow.keptCents >= 0;
  return (
    <TeaserCard title={`${month} so far`} href="/flow" style={style}
      accessibilityLabel={nothing ? `${month} so far. Nothing logged yet` : hidden ? `${month} so far. Amounts hidden` : `${month} so far. In ${money(flow.inCents)}, out ${money(flow.outCents)}`}
      aside={nothing ? <Txt v="small" c="ink2">Nothing logged yet</Txt>
        : kept ? <Txt v="figureSm">kept {money(flow.keptCents)} · {mask(String(Math.round(flow.keptShare * 100)))}%</Txt>
        : <Txt v="figureSm" style={{ color: c.down }}>{money(-flow.keptCents)} more out than in</Txt>}>
      <View style={{ flexDirection: 'row', gap: space[1], height: space[2], borderRadius: space[1], overflow: 'hidden' }}>
        <View style={{ flexGrow: flow.outCents, flexBasis: 0, backgroundColor: c.ink2 }} />
        <View style={{ flexGrow: Math.max(flow.keptCents, 0), flexBasis: 0, backgroundColor: c.ink }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: space[3] }}>
        <Txt v="figureSm" c="ink2">in {money(flow.inCents)}</Txt>
        <Txt v="figureSm" c="ink2">out {money(flow.outCents)}</Txt>
      </View>
    </TeaserCard>
  );
}
