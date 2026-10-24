import { View } from 'react-native';

import type { Summary } from '@/domain/summary';
import { useTheme } from '@/theme/theme';
import { useMoney } from './money';
import { Txt } from './Txt';

/** How the Liquid figure is made: what could be cash within a week, less everything owed. */
export function LiquidBreakdown({ summary, pledged }: { summary: Summary; pledged: { cents: number; partial: boolean } | null }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const after = summary.liquidAfterDebtsCents;
  const row = (label: string, value: string, strong = false, tone?: 'down') => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Txt v="body" c={strong ? 'ink' : 'ink2'} style={strong ? { fontFamily: 'Manrope_700Bold' } : undefined} maxFontSizeMultiplier={1.4}>{label}</Txt>
      <Txt v="figureSm" style={{ color: tone === 'down' ? c.down : c.ink, ...(strong ? { fontFamily: 'Manrope_700Bold' } : null) }} maxFontSizeMultiplier={1.4}>{value}</Txt>
    </View>
  );
  const spoken = hidden
    ? 'Liquid after debts. Amounts hidden.'
    : `Liquid after debts. Liquid assets ${money(summary.liquidCents)}, minus what you owe ${money(summary.oweCents)}, leaves ${money(after)}.`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ marginTop: 14, gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line2 }}>
      {row('Liquid assets', money(summary.liquidCents))}
      {row('What you owe', summary.oweCents > 0 ? money(-summary.oweCents) : money(0))}
      {row('Liquid after debts', money(after), true, after < 0 ? 'down' : undefined)}
      {after < 0 && <Txt v="small" c="ink2" maxFontSizeMultiplier={1.4}>What you owe is more than you could turn into cash within a week.</Txt>}
      {pledged && pledged.cents > 0 && (
        <Txt v="small" c="ink3" maxFontSizeMultiplier={1.4}>
          {money(pledged.cents)} of what you owe is backed by collateral{pledged.partial ? ' (some loans have no known collateral, so this may be low)' : ''}.
        </Txt>
      )}
    </View>
  );
}
