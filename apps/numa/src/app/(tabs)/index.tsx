import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';

import type { CloudCurrency } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { formatMoney, formatPercent } from '@/domain/money';
import { compositionAt } from '@/data/composition';
import { dayGroupOf, type DayGroup } from '@/data/day';
import { pointLabel, rangeWords, ranges, type Range } from '@/data/series';
import { useCloudHome, useDemoHome, type HomeModel } from '@/data/useHome';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { type as typeScale } from '@/theme/tokens';
import { CoachTip } from '@/ui/CoachTip';
import { CompositionBar, type Lens } from '@/ui/CompositionBar';
import { CurrencyScope, useMoney } from '@/ui/money';
import { MonthTeaser } from '@/ui/MonthTeaser';
import { WIDE } from '@/ui/Nav';
import { usePanelOpen } from '@/ui/Panel';
import { BarButtons, PinnedScreen } from '@/ui/PinnedScreen';
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

const COACH = 'home-scrub';

export default function HomeScreen() {
  const session = useSession();
  return session.kind === 'signedIn' ? <CloudHome /> : <DemoHome canSignIn={session.kind === 'demo' && session.canSignIn} />;
}

function DemoHome({ canSignIn }: { canSignIn: boolean }) {
  const [range, setRange] = useState<Range>('1D');
  return <HomeView model={useDemoHome(range)} range={range} setRange={setRange} canSignIn={canSignIn} />;
}

function CloudHome() {
  const [range, setRange] = useState<Range>('1D');
  return <HomeView model={useCloudHome(range)} range={range} setRange={setRange} canSignIn={false} />;
}

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 28, padding: 20, borderRadius: 20, backgroundColor: c.s1, gap: 8, maxWidth: 560 }}>
      <Txt v="section" accessibilityRole="header">{title}</Txt>
      <Txt v="body" c="ink2">{body}</Txt>
      {action}
    </View>
  );
}

function Button({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" aria-busy={busy} style={{ marginTop: 8, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center' }}>
      {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>{label}</Txt>}
    </Pressable>
  );
}

function StartSpace({ create }: { create: (currency: CloudCurrency) => Promise<void> }) {
  const { c } = useTheme();
  const [currency, setCurrency] = useState<CloudCurrency>('EUR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Message
      title="Set up your money"
      body="Pick the currency Numa adds everything up in. You can hold money in both."
      action={
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.s2, alignSelf: 'flex-start', marginTop: 6 }} accessibilityRole="radiogroup">
            {(['EUR', 'USD'] as const).map((cur) => (
              <Pressable key={cur} onPress={() => setCurrency(cur)} accessibilityRole="radio" aria-checked={currency === cur} style={{ minWidth: 72, minHeight: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: currency === cur ? c.bg : 'transparent' }}>
                <Txt v="body" c={currency === cur ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{cur === 'EUR' ? '€ Euro' : '$ Dollar'}</Txt>
              </Pressable>
            ))}
          </View>
          {error && <Txt v="body" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt>}
          <Button label="Start" busy={busy} onPress={async () => {
            setBusy(true); setError(null);
            try { await create(currency); } catch { setError('Couldn’t set this up. Try again.'); } finally { setBusy(false); }
          }} />
        </View>
      }
    />
  );
}

function LensTabs({ lens, setLens, wide, compact }: { lens: Lens; setLens: (l: Lens) => void; wide: boolean; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: wide ? 22 : compact ? 14 : 18 }} accessibilityRole="tablist">
      {tabs.map((t) => (
        <Pressable key={t.lens} onPress={() => setLens(t.lens)} accessibilityRole="tab" aria-selected={lens === t.lens} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Txt v="body" c={lens === t.lens ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_600SemiBold', fontSize: wide ? 16 : 15 }} maxFontSizeMultiplier={compact ? 1.2 : 1.4} numberOfLines={1}>{t.label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

function HomeView({ model, range, setRange, canSignIn }: { model: HomeModel; range: Range; setRange: (r: Range) => void; canSignIn: boolean }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [lens, setLens] = useState<Lens>('net');
  const { set } = usePrefs();
  const demo = model.status === 'ready' && model.source === 'demo';
  const shell = (children: React.ReactNode) => (
    <PinnedScreen nav={(compact) => <LensTabs lens={lens} setLens={setLens} wide={wide} compact={compact} />}
      buttons={(compact) => <BarButtons demo={demo} onDemo={canSignIn ? () => set('demo', false) : undefined} compact={compact} />}>
      {children}
    </PinnedScreen>
  );

  if (model.status === 'loading') {
    return shell(<View style={{ marginTop: 80, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading your money" /></View>);
  }
  if (model.status === 'error') {
    return shell(<Message title="Can’t load your money" body={model.message} action={<Button label="Try again" onPress={model.retry} />} />);
  }
  if (model.status === 'needsSpace') {
    return shell(<StartSpace create={model.create} />);
  }
  return (
    <CurrencyScope currency={model.currency}>
      <Ready model={model} range={range} setRange={setRange} lens={lens} setLens={setLens} shell={shell} wide={wide} />
    </CurrencyScope>
  );
}

function Ready({ model, range, setRange, lens, shell, wide }: { model: Extract<HomeModel, { status: 'ready' }>; range: Range; setRange: (r: Range) => void; lens: Lens; setLens: (l: Lens) => void; shell: (children: React.ReactNode) => React.ReactNode; wide: boolean }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { mask, money } = useMoney();
  const { seenTips, seeTip } = usePrefs();
  // A drag previews a date; letting go (or a tap) keeps it, by time, until "Back to today".
  const [preview, setPreview] = useState<number | null>(null);
  const [pinnedAt, setPinnedAt] = useState<number | null>(null);
  const { summary, points, currency } = model;
  const pinnedIdx = pinnedAt === null ? -1 : points.findIndex((p) => p.t === pinnedAt);
  const pinned = pinnedIdx >= 0 && pinnedIdx < points.length - 1 ? pinnedIdx : null;
  const scrub = preview ?? pinned;
  const unpin = () => { setPinnedAt(null); setPreview(null); };
  const coach = !seenTips.includes(COACH) && model.hasHistory && !model.empty;

  // Demo history scales with the lens. Real history is saved for net worth only, so the
  // chart stays on net worth and the figure shows the lens value today.
  const lensNow = lens === 'net' ? summary.netCents : lens === 'liquid' ? summary.liquidCents : summary.cashCents;
  const ratio = model.source === 'demo' && lens !== 'net' && summary.netCents !== 0 ? lensNow / summary.netCents : 1;
  const values = points.map((p) => Math.round(p.cents * ratio));
  values[values.length - 1] = model.source === 'demo' ? (lens === 'net' ? values[values.length - 1] : lensNow) : summary.netCents;
  const chartFollowsLens = model.source === 'demo' || lens === 'net';
  const idx = scrub ?? values.length - 1;
  const shown = scrub !== null || chartFollowsLens ? values[idx] : lensNow;
  const diff = values[idx] - values[0];
  const up = diff >= 0;
  const showChange = chartFollowsLens && model.hasHistory;
  // The blocks follow the finger too: the last point is today, so it shows the live split.
  const composition = useMemo(() => compositionAt(scrub !== null && idx < points.length - 1 ? points[idx] : null, summary, model.source), [scrub, idx, points, summary, model.source]);
  // A kept date with a saved split opens that date's details; otherwise the blocks open today's items.
  const keptPoint = preview === null && pinned !== null ? points[pinned] : null;
  const openDay = keptPoint?.parts && model.source === 'cloud'
    ? (group?: DayGroup) => router.push({ pathname: '/day/[t]', params: { t: String(keptPoint.t), ...(group ? { group } : {}) } })
    : undefined;

  const hero = wide ? typeScale.display : typeScale.hero;
  const centsStyle = wide ? { ...typeScale.cents, fontSize: 42, lineHeight: 42 } : typeScale.cents;
  const abs = Math.abs(shown);
  const whole = (shown < 0 ? '−' : '') + formatMoney(abs - (abs % 100), currency);
  const cents = '.' + (abs % 100).toString().padStart(2, '0');

  const heroBlock = (
    <View>
      {model.available ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Odometer text={mask(whole)} style={{ ...hero, color: c.ink, fontVariant: ['tabular-nums'] }} fast={scrub !== null} />
          <Odometer text={mask(cents)} style={{ ...centsStyle, color: c.ink3, fontVariant: ['tabular-nums'] }} fast={scrub !== null} />
        </View>
      ) : (
        <Txt style={{ ...hero, color: c.ink3 }} accessibilityLabel="Total unavailable">—</Txt>
      )}
      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {!model.available ? (
          <Txt v="body" c="ink2">Totals need today’s exchange rate.</Txt>
        ) : showChange ? (
          <>
            <Txt v="figure" style={{ fontSize: 15, color: up ? c.upInk : c.down }}>{mask((up ? '▲ ' : '▼ ') + formatMoney(Math.abs(diff), currency, { cents: true }) + (values[0] ? ' ' + formatPercent(diff / Math.abs(values[0])) : ''))}</Txt>
            <Txt v="body" c="ink2">{scrub !== null ? pointLabel(points[idx].t, range, model.now) : rangeWords(range, points[0].t)}</Txt>
          </>
        ) : (
          model.empty ? null : <Txt v="body" c="ink2">{lens !== 'net' && !chartFollowsLens ? 'Today' : 'History starts today'}</Txt>
        )}
        {preview === null && pinned !== null && (
          <Pressable onPress={unpin} accessibilityRole="button" accessibilityLabel="Back to today" hitSlop={8}
            style={{ minHeight: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.s2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt v="small" c="ink" style={{ fontFamily: 'Manrope_700Bold' }} maxFontSizeMultiplier={1.4}>Back to today</Txt>
            <Txt v="small" c="ink3" maxFontSizeMultiplier={1.4}>✕</Txt>
          </Pressable>
        )}
        {scrub === null && model.live && range === '1D' && model.available && (
          <View style={{ minHeight: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.upBg, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
        <Pressable key={r} onPress={() => { setRange(r); unpin(); }} accessibilityRole="tab" aria-selected={range === r} style={{ minWidth: 48, minHeight: 36, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: range === r ? c.s2 : 'transparent' }}>
          <Txt v="small" c={range === r ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }} maxFontSizeMultiplier={1.4}>{r}</Txt>
        </Pressable>
      ))}
    </View>
  );

  const chartHeight = wide ? 280 : 190;
  const showChart = model.available && !model.empty;
  const chart = showChart ? (
    <View style={{ marginHorizontal: wide ? 0 : -20 }}>
      <ScrubChart values={values} times={model.source === 'cloud' ? points.map((p) => p.t) : undefined} height={chartHeight} up={up} drawKey={range + (chartFollowsLens ? lens : 'net')} pinned={pinned}
        onPreview={(i) => { setPreview(i); if (i !== null && coach) seeTip(COACH); }}
        onPin={(i) => { setPreview(null); setPinnedAt(i >= points.length - 1 ? null : points[i].t); if (coach) seeTip(COACH); }} />
      {coach && <CoachTip title="Drag the line to go back in time" body="Let go to stay on that date, then tap a block to see what was in it." top={chartHeight * 0.45} width={wide ? 1000 : width} onDismiss={() => seeTip(COACH)} />}
    </View>
  ) : null;

  const blocks = model.empty ? (
    <Message title="Nothing tracked yet" body="Tap the plus and type what you have, like “Bank balance 12,500” or “Bought 10 VOO at $500”. It shows up here as blocks." action={model.source === 'cloud' ? <Link href="/import" asChild><Pressable accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Keep your numbers in a spreadsheet? Import it ›</Txt></Pressable></Link> : undefined} />
  ) : model.available ? (
    <View>
      <CompositionBar {...composition} lens={lens} wide={wide} when={scrub !== null && idx < points.length - 1 ? pointLabel(points[idx].t, range, model.now) : undefined}
        onOpen={openDay ? (cat) => openDay(dayGroupOf(cat)) : undefined} />
      {notes[lens] ? <Txt v="body" c="ink2" style={{ fontSize: 13.5, marginTop: 10 }}>{notes[lens]}</Txt> : null}
      {summary.unknown.length > 0 && <Txt v="small" c="ink3" style={{ marginTop: 8 }}>{summary.unknown.length} without a value {summary.unknown.length === 1 ? 'is' : 'are'} left out.</Txt>}
      {lens !== 'net' && !chartFollowsLens && <Txt v="small" c="ink3" style={{ marginTop: 6 }}>{tabs.find((t) => t.lens === lens)!.label} today: {money(lensNow)}. The chart shows net worth.</Txt>}
    </View>
  ) : null;

  const panelOpen = usePanelOpen();
  const teaser = <MonthTeaser month={model.month} flow={model.flow} />;
  const needs = <NeedsYou items={model.attention} />;

  if (wide) {
    return shell(
      <View style={{ gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>{heroBlock}{showChart && rangePills}</View>
          {chart}
          {/* Beside an open panel the page is narrower, so the two columns stack. */}
          <View style={{ flexDirection: panelOpen ? 'column' : 'row', gap: panelOpen ? 28 : 48, alignItems: panelOpen ? 'stretch' : 'flex-start', marginTop: 14 }}>
            <View style={{ flex: panelOpen ? undefined : 1.7, gap: 28 }}>{blocks}{teaser}</View>
            <View style={{ flex: panelOpen ? undefined : 1, minWidth: 320 }}>{needs}</View>
          </View>
      </View>,
    );
  }
  return shell(
    <>
      <View style={{ marginTop: 4 }}>{heroBlock}</View>
      {chart && <View style={{ marginTop: 12 }}>{chart}</View>}
      {showChart && <View style={{ marginTop: 6, marginHorizontal: -6 }}>{rangePills}</View>}
      <View style={{ marginTop: 28 }}>{blocks}</View>
      <View style={{ marginTop: 28 }}>{teaser}</View>
      <View style={{ marginTop: 30 }}>{needs}</View>
    </>,
  );
}
