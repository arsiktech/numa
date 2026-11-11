import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { HomeMovementReport } from '@/data/homeMovers';
import { pointLabel, rangeWords } from '@/data/series';
import { formatPercent } from '@/domain/money';
import { collapseMovers, type Mover } from '@/domain/movers';
import { useTheme } from '@/theme/theme';
import { CurrencyScope, useMoney } from '@/ui/money';
import { useMovers } from '@/ui/MoversContext';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

function ChangeRow({ row }: { row: Mover }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  const percent = row.percent === null ? null : `${formatPercent(row.percent)}${row.debt ? ' debt value' : ''}`;
  return (
    <View style={{ minHeight: 64, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{mask(row.name)}</Txt>
        <Txt v="small" c="ink2" style={{ fontSize: 13.5 }}>{mask([row.group, percent, 'Price estimate'].filter(Boolean).join(' · '))}</Txt>
      </View>
      <Txt v="figure" style={{ fontSize: 15, color: row.cents >= 0 ? c.upInk : c.down }}>{money(row.cents, { cents: true, sign: true })}</Txt>
    </View>
  );
}

function Rows({ title, rows }: { title: string; rows: Mover[] }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const [expanded, setExpanded] = useState(false);
  const { shown, more, moreCount, moreCents } = collapseMovers(rows);
  return (
    <View style={{ marginTop: 24 }}>
      <Txt v="section" accessibilityRole="header">{title}</Txt>
      {!rows.length && <Txt v="small" c="ink3" style={{ marginTop: 10 }}>No attributed {title.toLowerCase()}.</Txt>}
      {(expanded ? rows : shown).map((row) => <ChangeRow key={row.id} row={row} />)}
      {more.length > 0 && <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" aria-expanded={expanded}
        style={{ minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Txt v="body" c="ink2">{expanded ? 'Show fewer' : `${moreCount} more ${title.toLowerCase()}`}</Txt>
        {!expanded && <Txt v="figureSm" style={{ color: moreCents >= 0 ? c.upInk : c.down }}>{money(moreCents, { cents: true, sign: true })}</Txt>}
      </Pressable>}
    </View>
  );
}

function Breakdown({ report }: { report: HomeMovementReport }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  const { movers } = report;
  const period = rangeWords(report.range, report.from);
  const lensName = report.lens === 'net' ? 'Net worth' : report.lens === 'liquid' ? 'Liquid' : 'Cash';
  const missing = movers.coverage.filter((r) => !r.flat), flat = movers.coverage.filter((r) => r.flat);
  if (!movers.available || movers.headlineCents === null) return <Txt v="body" c="ink2">Unavailable. Open a new breakdown when comparable totals are available.</Txt>;
  return (
    <>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>{lensName}{report.demo ? ' · DEMO DATA' : ''}</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>Why it moved {period}</Txt>
      <Txt v="figure" style={{ marginTop: 12, fontSize: 34, lineHeight: 42, color: movers.headlineCents >= 0 ? c.upInk : c.down }}>{money(movers.headlineCents, { cents: true, sign: true })}</Txt>
      <Txt v="small" c="ink2" style={{ marginTop: 6 }}>Same endpoints as Home · {pointLabel(report.from, report.range, report.now)} → {pointLabel(report.to, report.range, report.now)}</Txt>
      <Txt v="body" style={{ marginTop: 20, fontFamily: 'Manrope_600SemiBold' }}>{report.basis}</Txt>
      {report.notes.map((note) => <Txt key={note} v="small" c="ink2" style={{ marginTop: 6, fontSize: 14, lineHeight: 21 }}>{note}</Txt>)}
      {movers.nothingMoved && <Txt v="body" c="ink2" style={{ marginTop: 24 }}>{report.range === '1D' ? 'Nothing moved today.' : 'Nothing moved in this period.'}</Txt>}
      {!movers.nothingMoved && !movers.gainers.length && !movers.losers.length && <Txt v="body" c="ink2" style={{ marginTop: 24 }}>No price moves can be attributed for this period.</Txt>}
      <Rows title="Gainers" rows={movers.gainers} />
      <Rows title="Losers" rows={movers.losers} />
      {movers.unexplainedCents !== null && movers.unexplainedCents !== 0 && <View style={{ marginTop: 24, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.line, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Txt v="body" style={{ flex: 1, fontFamily: 'Manrope_600SemiBold' }}>Unexplained change</Txt>
          <Txt v="figure" style={{ fontSize: 15, color: movers.unexplainedCents > 0 ? c.upInk : c.down }}>{money(movers.unexplainedCents, { cents: true, sign: true })}</Txt>
        </View>
        <Txt v="small" c="ink2" style={{ fontSize: 14, lineHeight: 21 }}>The remainder needed to match Home, including any rounding. Its cause has not been identified.</Txt>
      </View>}
      <Txt v="small" c="ink3" style={{ marginTop: 14, fontSize: 13.5 }}>Every displayed row, including collapsed rows and any unexplained change, adds up to {money(movers.headlineCents, { cents: true, sign: true })}.</Txt>
      {missing.length > 0 && <View style={{ marginTop: 26 }}>
        <Txt v="section" accessibilityRole="header">Missing coverage</Txt>
        <Txt v="small" c="ink2" style={{ marginTop: 6 }}>These records are not assumed to have stayed unchanged.</Txt>
        {missing.map((row) => <View key={row.id} style={{ minHeight: 56, paddingVertical: 10, gap: 3, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Txt v="body">{mask(row.name)}</Txt><Txt v="small" c="ink2" style={{ fontSize: 13.5 }}>{mask(row.reason)}</Txt>
        </View>)}
      </View>}
      {flat.length > 0 && <View style={{ marginTop: 24 }}>
        <Txt v="section" accessibilityRole="header">No price move in estimate</Txt>
        {flat.map((row) => <View key={row.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}><Txt v="body" c="ink2">{mask(row.name)}</Txt></View>)}
      </View>}
    </>
  );
}

export default function MoversScreen() {
  const { request, clear } = useMovers();
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('beforeRemove', clear), [navigation, clear]);
  return (
    <Screen>
      {request ? <CurrencyScope currency={request.currency}><Breakdown report={request.report} /></CurrencyScope> : <View style={{ marginTop: 12, gap: 12 }}>
        <Txt v="title" accessibilityRole="header">Change breakdown</Txt>
        <Txt v="body" c="ink2">Open the change line on Home to see a breakdown. If your data or space changed, open it again for the current values.</Txt>
      </View>}
    </Screen>
  );
}
