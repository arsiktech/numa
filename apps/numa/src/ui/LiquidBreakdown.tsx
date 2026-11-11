import { View } from 'react-native';

import type { Summary } from '@/domain/summary';
import type { Invested } from '@/loans/useInvested';
import { useTheme } from '@/theme/theme';
import { useMoney } from './money';
import { Txt } from './Txt';

/**
 * How the Liquid figure is made: what could be cash within a week, less what is owed. Money a loan
 * put into something that can't be sold within a week (a company, property) is still owed, but is
 * not taken from it, up to what that thing is worth.
 */
export function LiquidBreakdown({ summary, pledged, invested = null }: { summary: Summary; pledged: { cents: number; partial: boolean } | null; invested?: Invested | null }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const after = summary.liquidAfterDebtsCents;
  const left = summary.investedCents;
  const row = (label: string, value: string, strong = false, tone?: 'down') => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Txt v="body" c={strong ? 'ink' : 'ink2'} style={[{ flexShrink: 1 }, strong ? { fontFamily: 'Manrope_700Bold' } : null]} maxFontSizeMultiplier={1.4}>{label}</Txt>
      <Txt v="figureSm" style={{ color: tone === 'down' ? c.down : c.ink, ...(strong ? { fontFamily: 'Manrope_700Bold' } : null) }} maxFontSizeMultiplier={1.4}>{value}</Txt>
    </View>
  );
  const spoken = hidden
    ? 'Liquid after debts. Amounts hidden.'
    : `Liquid after debts. Liquid assets ${money(summary.liquidCents)}, minus what you owe ${money(summary.oweCents)}${left > 0 ? `, except ${money(left)} that went into things you can’t sell within a week` : ''}, leaves ${money(after)}.`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ marginTop: 14, gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line2 }}>
      {row('Liquid assets', money(summary.liquidCents))}
      {row('What you owe', summary.oweCents > 0 ? money(-summary.oweCents) : money(0))}
      {left > 0 && row('Went into things you can’t sell this week', money(left))}
      {row('Liquid after debts', money(after), true, after < 0 ? 'down' : undefined)}
      {after < 0 && <Txt v="small" c="ink2" maxFontSizeMultiplier={1.4}>What you owe is more than you could turn into cash within a week.</Txt>}
      {left > 0 && (
        <Txt v="small" c="ink3" maxFontSizeMultiplier={1.4}>
          {money(left)} of what you owe went into things you can’t sell within a week, like a company. It is still owed, but it isn’t taken from what you could have this week. Any part those things don’t cover still is.{invested?.partial ? ' Some of those places have no value yet, so this may be low.' : ''}
        </Txt>
      )}
      {left === 0 && summary.oweCents > 0 && invested && !invested.linked && (
        <Txt v="small" c="ink3" maxFontSizeMultiplier={1.4}>
          If a loan’s money went into your company or property, pick where it went on the loan’s page, and it won’t be taken from what you could have this week.
        </Txt>
      )}
      {pledged && pledged.cents > 0 && (
        <Txt v="small" c="ink3" maxFontSizeMultiplier={1.4}>
          {money(pledged.cents)} of what you owe is backed by collateral{pledged.partial ? ' (some loans have no known collateral, so this may be low)' : ''}.
        </Txt>
      )}
    </View>
  );
}
