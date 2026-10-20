import { router } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';
import { useEarnings } from './useEarnings';

/** What DeFi earned in the last 30 days, opening the earnings screen. Signed-in only, once a wallet is read. */
export function EarningsTeaser({ style }: { style?: ViewStyle }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const state = useEarnings('30d');
  if (state.status !== 'ready' || !state.tracked || !state.earnings) return null;
  const e = state.earnings;
  const started = e.series.length > 0;
  return (
    <Pressable onPress={() => router.push('/earnings')} accessibilityRole="link"
      accessibilityLabel={started ? `DeFi earnings, ${money(e.netCents, { sign: true })} in the last 30 days. Open` : 'DeFi earnings, tracking started. Open'}
      style={[{ backgroundColor: c.s1, borderRadius: 18, padding: 16, gap: 6 }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt v="cardTitle">DeFi earnings</Txt>
        <Txt v="body" c="ink3">›</Txt>
      </View>
      {started ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Txt v="figure" style={{ fontSize: 20, color: e.netCents >= 0 ? c.upInk : c.down }}>{money(e.netCents, { cents: true, sign: true })}</Txt>
          <Txt v="small" c="ink2">last 30 days{e.rate !== null ? ` · about ${(e.rate * 100).toFixed(1)}% a year` : ''}</Txt>
        </View>
      ) : (
        <Txt v="small" c="ink2">Tracking started. Earnings show after a full day.</Txt>
      )}
    </Pressable>
  );
}
