import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pointLabel, rangeWords, ranges, type Range } from '@/data/demo';
import { useHome } from '@/data/useHome';
import { formatMoney, formatPercent } from '@/domain/money';
import { useTheme } from '@/theme/theme';
import { type as typeScale } from '@/theme/tokens';
import { CoachTip } from '@/ui/CoachTip';
import { CompositionBar, type Lens } from '@/ui/CompositionBar';
import { IconEye } from '@/ui/icons';
import { MonthTeaser } from '@/ui/MonthTeaser';
import { WIDE } from '@/ui/Nav';
import { NeedsYou } from '@/ui/NeedsYou';
import { Odometer } from '@/ui/Odometer';
import { ScrubChart } from '@/ui/ScrubChart';
import { Txt } from '@/ui/Txt';

const tabs: { lens: Lens; label: string }[] = [
  { lens: 'net', label: 'Net worth' },
  { lens: 'liquid', label: 'Liquid' },
  { lens: 'cash', label: 'Cash' },
];

const notes: Record<Lens, string | null> = {
  net: null,
  liquid: 'Dimmed blocks can’t be sold within a week. Locked shares join when their lock-up ends; pledged coins join when the loan is repaid.',
  cash: 'Cash and stablecoins only.',
};

export default function Home() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [lens, setLens] = useState<Lens>('net');
  const [range, setRange] = useState<Range>('1D');
  const [scrub, setScrub] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [coach, setCoach] = useState(true);
  const home = useHome(range);

  const ratio = lens === 'net' ? 1 : lens === 'liquid' ? home.summary.liquidCents / home.summary.netCents : home.summary.cashCents / home.summary.netCents;
  const values = home.series.map((v) => Math.round(v * ratio));
  if (lens === 'cash') values[values.length - 1] = home.summary.cashCents;
  const idx = scrub ?? values.length - 1;
  const shown = values[idx];
  const diff = shown - values[0];
  const up = diff >= 0;
  const hero = wide ? typeScale.display : typeScale.hero;
  const centsStyle = wide ? { ...typeScale.cents, fontSize: 42, lineHeight: 42 } : typeScale.cents;
  const whole = formatMoney(Math.floor(shown / 100) * 100).replace('€', '');
  const cents = (Math.abs(shown) % 100).toString().padStart(2, '0');
  const mask = (s: string) => (hidden ? s.replace(/[0-9]/g, '•') : s);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', gap: wide ? 22 : 16 }} accessibilityRole="tablist">
        {tabs.map((t) => (
          <Pressable key={t.lens} onPress={() => { setLens(t.lens); setScrub(null); }} accessibilityRole="tab" accessibilityState={{ selected: lens === t.lens }} style={{ height: 44, justifyContent: 'center' }}>
            <Txt v="body" c={lens === t.lens ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_600SemiBold', fontSize: wide ? 16 : 15 }}>{t.label}</Txt>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}>
          <Txt v="label" c="ink2" style={{ fontSize: 10 }}>Demo data</Txt>
        </View>
        <Pressable onPress={() => setHidden((h) => !h)} accessibilityRole="switch" accessibilityState={{ checked: hidden }} accessibilityLabel="Hide amounts" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <IconEye color={c.ink} />
        </Pressable>
      </View>
    </View>
  );

  const heroBlock = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Odometer text={mask('€' + whole)} style={{ ...hero, color: c.ink, fontVariant: ['tabular-nums'] }} fast={scrub !== null} />
        <Odometer text={mask('.' + cents)} style={{ ...centsStyle, color: c.ink3, fontVariant: ['tabular-nums'] }} fast={scrub !== null} />
      </View>
      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Txt v="figure" style={{ fontSize: 15, color: up ? c.upInk : c.down }}>{mask((up ? '▲ ' : '▼ ') + formatMoney(Math.abs(diff), 'EUR', { cents: true }) + ' ' + formatPercent(diff / values[0]))}</Txt>
        <Txt v="body" c="ink2">{scrub !== null ? pointLabel(range, idx, values.length) : rangeWords[range]}</Txt>
        {scrub === null && range === '1D' && (
          <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.upBg, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.up }} />
            <Txt v="label" c="upInk">Live</Txt>
          </View>
        )}
      </View>
    </View>
  );

  const rangePills = (
    <View style={{ flexDirection: 'row', justifyContent: wide ? 'flex-end' : 'space-between', gap: 4 }} accessibilityRole="tablist">
      {ranges.map((r) => (
        <Pressable key={r} onPress={() => { setRange(r); setScrub(null); }} accessibilityRole="tab" accessibilityState={{ selected: range === r }} style={{ minWidth: 48, minHeight: 36, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: range === r ? c.s2 : 'transparent' }}>
          <Txt v="small" c={range === r ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>{r}</Txt>
        </Pressable>
      ))}
    </View>
  );

  const chartHeight = wide ? 280 : 190;
  const chart = (
    <View style={{ marginHorizontal: wide ? 0 : -20 }}>
      <ScrubChart values={values} height={chartHeight} up={up} drawKey={range + lens} onScrub={(i) => { setScrub(i); if (i !== null) setCoach(false); }} />
      {coach && <CoachTip title="Drag the line to go back in time" body="The big number follows your finger." top={chartHeight * 0.45} width={wide ? 1000 : width} onDismiss={() => setCoach(false)} />}
    </View>
  );

  const blocks = <CompositionBar categories={home.summary.categories} ownCents={home.summary.ownCents} oweCents={home.summary.oweCents} netCents={home.summary.netCents} lens={lens} wide={wide} />;
  const note = notes[lens] ? <Txt v="body" c="ink2" style={{ fontSize: 13.5, marginTop: 10 }}>{notes[lens]}</Txt> : null;

  if (wide) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 22, paddingBottom: 60 }}>
        <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', gap: 20 }}>
          {header}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>{heroBlock}{rangePills}</View>
          {chart}
          <View style={{ flexDirection: 'row', gap: 48, alignItems: 'flex-start', marginTop: 14 }}>
            <View style={{ flex: 1.7, gap: 28 }}>
              <View>{blocks}{note}</View>
              <MonthTeaser month={home.month} flow={home.flow} />
            </View>
            <View style={{ flex: 1, minWidth: 320 }}>
              <NeedsYou items={home.attention} />
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 150 }}>
      {header}
      <View style={{ marginTop: 4 }}>{heroBlock}</View>
      <View style={{ marginTop: 12 }}>{chart}</View>
      <View style={{ marginTop: 6, marginHorizontal: -6 }}>{rangePills}</View>
      <View style={{ marginTop: 28 }}>{blocks}{note}</View>
      <View style={{ marginTop: 28 }}><MonthTeaser month={home.month} flow={home.flow} /></View>
      <View style={{ marginTop: 30 }}><NeedsYou items={home.attention} /></View>
    </ScrollView>
  );
}
