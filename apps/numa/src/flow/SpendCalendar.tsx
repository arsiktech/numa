import { Pressable, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme';
import { duration } from '@/theme/tokens';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';
import { versusAverage, type CalendarDay, type MonthCalendar } from './calendar';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const dayName = (at: number) => new Date(at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

/** A short amount that fits a day's cell: "€46", "€1.2k". */
function short(cents: number, money: (c: number) => string): string {
  if (cents <= 0) return '';
  // "€1,200" reads as "€1.2k" in a cell this small.
  return cents >= 100_000 ? money(Math.round(cents / 10_000) * 10_000).replace(/,(\d)\d\d$/, '.$1k').replace('.0k', 'k') : money(cents);
}

/**
 * The month's spending as a calendar: each day shaded by how much went out, darkest for the biggest
 * days, a green dot where money came in. Tapping a day picks it; tapping it again lets go.
 */
export function SpendCalendar({ cal, selected, onSelect }: { cal: MonthCalendar; selected: number | null; onSelect: (day: number | null) => void }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const reduce = useReducedMotion();
  // Shades from the theme's own greys, so both themes read the same: none to most.
  const shades = [c.s1, c.line2, c.ink3, c.ink2, c.ink];
  const ink = (level: CalendarDay['level']) => (level >= 2 ? c.bg : c.ink2);
  const cells: (CalendarDay | null)[] = [...Array.from({ length: cal.lead }, () => null), ...cal.days];
  const rows: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push([...cells.slice(i, i + 7), ...Array.from({ length: Math.max(0, 7 - cells.slice(i, i + 7).length) }, () => null)]);
  const pick = selected !== null ? cal.days[selected - 1] ?? null : null;
  const versus = pick ? versusAverage(pick, cal.averageCents) : null;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {WEEK.map((w, i) => <Txt key={i} v="label" c="ink3" style={{ flex: 1, textAlign: 'center' }}>{w}</Txt>)}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
          {row.map((d, i) => d === null ? <View key={i} style={{ flex: 1 }} /> : (
            <Animated.View key={i} style={{ flex: 1 }} entering={reduce ? undefined : FadeIn.duration(duration.morph).delay(d.day * 14)}>
              <Pressable onPress={() => onSelect(selected === d.day ? null : d.day)} accessibilityRole="button" aria-selected={selected === d.day}
                accessibilityLabel={`${dayName(d.at)}: ${d.spentCents > 0 ? `spent ${hidden ? 'an amount hidden' : money(d.spentCents)}` : 'nothing spent'}${d.unknown ? `, ${d.unknown} in another currency left out` : ''}${d.income ? ', money came in' : ''}`}
                style={{ height: 46, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 6, justifyContent: 'space-between', backgroundColor: shades[d.level], borderWidth: 2, borderColor: selected === d.day ? c.ink : 'transparent' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt v="small" style={{ fontSize: 11, lineHeight: 13, fontFamily: 'Manrope_700Bold', color: ink(d.level) }}>{d.day}</Txt>
                  {d.income && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.up }} />}
                </View>
                <Txt v="figureSm" numberOfLines={1} style={{ fontSize: 9, lineHeight: 11, color: ink(d.level) }}>{hidden ? '' : short(d.spentCents, (x) => money(x))}</Txt>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <Txt v="small" c="ink2">Less</Txt>
        {shades.map((s, i) => <View key={i} style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: s }} />)}
        <Txt v="small" c="ink2">More</Txt>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.up }} />
          <Txt v="small" c="ink2">Money in</Txt>
        </View>
      </View>
      {pick && (
        <View style={{ marginTop: 10, padding: 14, borderRadius: 18, backgroundColor: c.s1, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <Txt v="cardTitle">{dayName(pick.at)}</Txt>
            <Txt v="figure" style={{ fontSize: 17 }}>{pick.spentCents > 0 ? `−${money(pick.spentCents, { cents: true })}` : money(0)}</Txt>
          </View>
          <Txt v="small" c="ink2">{pick.spentCents > 0 ? versus ?? '' : 'Nothing spent'}{pick.count ? ` · ${pick.count} ${pick.count === 1 ? 'purchase' : 'purchases'}` : ''}</Txt>
        </View>
      )}
    </View>
  );
}
