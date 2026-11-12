import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { TeaserCard } from '@/ui/TeaserCard';
import { Txt } from '@/ui/Txt';
import { useEarnings } from './useEarnings';

/** What DeFi earned in the last 30 days, opening the earnings screen. Signed-in only, once a wallet is read. */
export function EarningsTeaser({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const state = useEarnings('30d');
  if (state.status !== 'ready' || !state.tracked || !state.earnings) return null;
  const e = state.earnings;
  const started = e.series.length > 0;
  return (
    <TeaserCard title="DeFi earnings" href="/earnings" style={style}
      accessibilityLabel={started ? `DeFi earnings, ${money(e.netCents, { sign: true })} in the last 30 days. Open` : 'DeFi earnings, tracking started. Open'}>
      {started ? (
        <>
          <Txt v="figure" style={e.netCents < 0 ? { color: c.down } : undefined}>{money(e.netCents, { cents: true, sign: true })}</Txt>
          <Txt v="small" c="ink2">last 30 days{e.rate !== null ? ` · about ${(e.rate * 100).toFixed(1)}% a year` : ''}</Txt>
        </>
      ) : (
        <Txt v="small" c="ink2">Tracking started. Earnings show after a full day.</Txt>
      )}
    </TeaserCard>
  );
}
