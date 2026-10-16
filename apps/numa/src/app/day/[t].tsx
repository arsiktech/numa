import { Link, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { dayDetails, dayGroupNames, type DayGroup, type DaySection } from '@/data/day';
import { longDay } from '@/domain/freshness';
import { useTheme } from '@/theme/theme';
import { CurrencyScope, useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

/** What you had on one saved date, opened from a block on Home while that date is kept on the chart. */
export default function DayScreen() {
  const { t, group } = useLocalSearchParams<{ t: string; group?: string }>();
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to see your saved dates.</Txt></Screen>;
  return <Cloud takenAt={Number(t)} focus={group && group in dayGroupNames ? (group as DayGroup) : undefined} />;
}

function Cloud({ takenAt, focus }: { takenAt: number; focus?: DayGroup }) {
  const cloud = useCloudData();
  if (cloud.status !== 'ready') {
    return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}>{cloud.status === 'error' ? <Txt v="body" c="ink2">{cloud.message}</Txt> : <ActivityIndicator accessibilityLabel="Loading" />}</View></Screen>;
  }
  const day = dayDetails(cloud.snapshot.wealthSnapshots, takenAt, cloud.data.currency, cloud.fx);
  if (!day) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Nothing was saved for that date.</Txt></Screen>;
  // The tapped part comes first; the rest of the date follows for context.
  const sections = focus ? [...day.sections.filter((s) => s.group === focus), ...day.sections.filter((s) => s.group !== focus)] : day.sections;
  return (
    <CurrencyScope currency={day.currency}>
      <Screen>
        <Txt v="label" c="ink3" style={{ marginTop: 6 }}>What you had on</Txt>
        <Txt v="title" accessibilityRole="header">{longDay(day.takenAt)}</Txt>
        <NetWorth cents={day.netCents} />
        {!day.detailed && (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 16, gap: 6 }}>
            <Txt v="body" c="ink2">Only the totals were saved for this date. Import your wealth log again to add what was in each part.</Txt>
            <Link href="/import" asChild>
              <Pressable accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Import ›</Txt>
              </Pressable>
            </Link>
          </View>
        )}
        {sections.map((s) => <Section key={s.group} section={s} focused={s.group === focus} />)}
      </Screen>
    </CurrencyScope>
  );
}

function NetWorth({ cents }: { cents: number }) {
  const { money } = useMoney();
  return <Txt v="body" c="ink2" style={{ marginTop: 4 }}>Net worth {money(cents)}</Txt>;
}

function Section({ section, focused }: { section: DaySection; focused: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const owe = section.group === 'owe';
  return (
    <View style={{ marginTop: 24 }} accessibilityLabel={focused ? `${dayGroupNames[section.group]}, the part you opened` : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 32 }}>
        <Txt v="section" style={focused ? { color: c.ink } : undefined}>{dayGroupNames[section.group]}</Txt>
        <Txt v="figureSm" style={{ fontSize: focused ? 17 : 14, color: owe ? c.down : c.ink }}>{money(section.cents)}</Txt>
      </View>
      {section.lines.map((l, i) => (
        <View key={l.name + i} style={{ minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === section.lines.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Txt v="body">{l.name}</Txt>
            <Txt v="small" c="ink3">{l.kind}</Txt>
          </View>
          <Txt v="figureSm" style={{ fontSize: 14, color: owe ? c.down : c.ink }}>{money(l.cents)}</Txt>
        </View>
      ))}
    </View>
  );
}
