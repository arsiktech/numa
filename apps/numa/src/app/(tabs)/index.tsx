import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions, type DimensionValue, type ViewStyle } from 'react-native';

import type { CloudCurrency } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { formatMoney, formatPercent } from '@/domain/money';
import { compositionAt } from '@/data/composition';
import { homeMovementReport } from '@/data/homeMovers';
import { dayGroupOf, type DayGroup } from '@/data/day';
import { pointLabel, rangeWords, ranges, tickLabel, type Range } from '@/data/series';
import { useCloudHome, useDemoHome, type HomeModel } from '@/data/useHome';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { radius, space, type as typeScale } from '@/theme/tokens';
import { CoachTip } from '@/ui/CoachTip';
import { CompositionBar, type Lens } from '@/ui/CompositionBar';
import { CurrencyScope, useMoney } from '@/ui/money';
import { EarningsTeaser } from '@/earnings/EarningsTeaser';
import { MoneyMapTeaser } from '@/loans/MoneyMapTeaser';
import { LiquidBreakdown } from '@/ui/LiquidBreakdown';
import { MonthTeaser } from '@/ui/MonthTeaser';
import { useMovers } from '@/ui/MoversContext';
import { WIDE } from '@/ui/Nav';
import { BarButtons, GUTTER, PinnedScreen } from '@/ui/PinnedScreen';
import { NeedsYou } from '@/ui/NeedsYou';
import { Odometer } from '@/ui/Odometer';
import { ScrubChart } from '@/ui/ScrubChart';
import { arrowProps } from '@/ui/keys';
import { Txt } from '@/ui/Txt';

const tabs: { lens: Lens; label: string }[] = [
  { lens: 'net', label: 'Net worth' },
  { lens: 'liquid', label: 'Liquid' },
  { lens: 'cash', label: 'Cash' },
];

const notes: Record<Lens, string | null> = {
  net: null,
  liquid: 'What you could have within a week, minus what you owe, except money a loan put into something you can’t sell within a week. Dimmed blocks can’t be sold within a week. Locked shares join when their lock-up ends; pledged coins join when the loan is repaid.',
  cash: 'Cash and stablecoins only.',
};

const COACH = 'home-scrub';
const CHART_WIDE = 200;
const CHART_PHONE = 160;
/** Home's cards tile like the attention items: as many 280-point columns as fit, none wider than 560. */
const tile: ViewStyle = { flexGrow: 1, flexBasis: 280, maxWidth: 560 };

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
    <View style={{ marginTop: space[6], padding: space[6], borderRadius: radius.card, backgroundColor: c.s2, gap: space[2], maxWidth: 560 }}>
      <Txt v="section" accessibilityRole="header">{title}</Txt>
      <Txt v="body" c="ink2">{body}</Txt>
      {action}
    </View>
  );
}

function Button({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" aria-busy={busy} style={{ marginTop: space[2], alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space[6], borderRadius: radius.pill, backgroundColor: c.ink, justifyContent: 'center' }}>
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
        <View style={{ gap: space[1] }}>
          <View style={{ flexDirection: 'row', gap: space[1], padding: space[1], borderRadius: radius.pill, backgroundColor: c.s2, alignSelf: 'flex-start', marginTop: space[2] }} accessibilityRole="radiogroup">
            {(['EUR', 'USD'] as const).map((cur) => (
              <Pressable key={cur} onPress={() => setCurrency(cur)} accessibilityRole="radio" aria-checked={currency === cur} style={{ minWidth: 72, minHeight: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: currency === cur ? c.bg : 'transparent' }}>
                <Txt v="body" c={currency === cur ? 'ink' : 'ink2'} style={{ fontFamily: 'Manrope_700Bold' }}>{cur === 'EUR' ? '€ Euro' : '$ Dollar'}</Txt>
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

/** One selected pill on a row of words: the lens switch and the range switch look and behave alike. */
function Choice<T extends string>({ options, value, onChange, label, size, dense }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string; size: 'body' | 'small'; dense?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} {...arrowProps(options, value, onChange)} accessibilityRole="tab" aria-selected={value === o}
          style={({ pressed }) => ({ minWidth: 44, minHeight: 44, paddingHorizontal: dense ? space[2] : space[3], borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: value === o ? c.s2 : 'transparent', opacity: pressed ? 0.72 : 1 })}>
          <Txt v={size} c={value === o ? 'ink' : 'ink2'} style={{ fontFamily: 'Manrope_700Bold' }} maxFontSizeMultiplier={1.4} numberOfLines={1}>{label(o)}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

const lensLabel = (l: Lens) => tabs.find((t) => t.lens === l)!.label;
const lensList = tabs.map((t) => t.lens);

/** Holds the place of the total, the chart and the blocks, so the page doesn't jump when they load. */
function HomeSkeleton({ wide }: { wide: boolean }) {
  const { c } = useTheme();
  const block = (height: number, width: DimensionValue, radiusPx: number = radius.bar) => <View style={{ height, width, borderRadius: radiusPx, backgroundColor: c.s2 }} />;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading your money" style={{ gap: space[4] }}>
      {block(wide ? 72 : 48, wide ? 340 : 220)}
      {block(24, 160)}
      {block(wide ? CHART_WIDE : CHART_PHONE, '100%')}
      {block(wide ? 64 : 56, '100%')}
      {block(120, '100%', radius.card)}
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
    <PinnedScreen nav={(compact) => <Choice options={lensList} value={lens} onChange={setLens} label={lensLabel} size="body" dense={compact} />}
      buttons={(compact) => <BarButtons demo={demo} onDemo={canSignIn ? () => set('demo', false) : undefined} compact={compact} />}>
      {children}
    </PinnedScreen>
  );

  if (model.status === 'loading') {
    return shell(<HomeSkeleton wide={wide} />);
  }
  if (model.status === 'error') {
    return shell(<Message title="Can’t load your money" body={model.message} action={<Button label="Try again" onPress={model.retry} />} />);
  }
  if (model.status === 'needsSpace') {
    return shell(<StartSpace create={model.create} />);
  }
  return (
    <CurrencyScope currency={model.currency}>
      <Ready key={`${model.scope}:${model.currency}`} model={model} range={range} setRange={setRange} lens={lens} setLens={setLens} shell={shell} wide={wide} />
    </CurrencyScope>
  );
}

function Ready({ model, range, setRange, lens, shell, wide }: { model: Extract<HomeModel, { status: 'ready' }>; range: Range; setRange: (r: Range) => void; lens: Lens; setLens: (l: Lens) => void; shell: (children: React.ReactNode) => React.ReactNode; wide: boolean }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { mask, money } = useMoney();
  const movers = useMovers();
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
  const lensNow = lens === 'net' ? summary.netCents : lens === 'liquid' ? summary.liquidAfterDebtsCents : summary.cashCents;
  // Liquid after debts can be negative or tiny, so scaling the demo line by it would flip or flatten the chart: only Cash scales it.
  const chartFollowsLens = (model.source === 'demo' && lens !== 'liquid') || lens === 'net';
  const rawRatio = model.source === 'demo' && lens === 'cash' && summary.netCents !== 0 ? lensNow / summary.netCents : 1;
  const ratio = Number.isFinite(rawRatio) ? rawRatio : 1;
  const values = points.map((p) => Math.round(p.cents * ratio));
  values[values.length - 1] = model.source === 'demo' ? (lens === 'cash' ? lensNow : values[values.length - 1]) : summary.netCents;
  const idx = scrub ?? values.length - 1;
  const shown = scrub !== null || chartFollowsLens ? values[idx] : lensNow;
  const diff = values[idx] - values[0];
  const up = diff >= 0;
  const showChange = chartFollowsLens && model.hasHistory;
  const openMovers = () => {
    if (!model.available || !Number.isSafeInteger(diff)) return;
    movers.open({ currency, report: homeMovementReport({
      items: model.items, basis: model.movementBasis, headlineCents: diff, from: points[0].t,
      to: points[idx].t, now: model.now, range, lens, currency, fx: model.fx,
    }) });
    router.push('/movers');
  };
  // The blocks follow the finger too: the last point is today, so it shows the live split.
  const composition = useMemo(() => compositionAt(scrub !== null && idx < points.length - 1 ? points[idx] : null, summary, model.source), [scrub, idx, points, summary, model.source]);
  // A kept date with a saved split opens that date's details; otherwise the blocks open today's items.
  const keptPoint = preview === null && pinned !== null ? points[pinned] : null;
  const openDay = keptPoint?.parts && model.source === 'cloud'
    ? (group?: DayGroup) => router.push({ pathname: '/day/[t]', params: { t: String(keptPoint.t), ...(group ? { group } : {}) } })
    : undefined;

  const hero = wide ? typeScale.display : typeScale.hero;
  const abs = Math.abs(shown);
  const whole = (shown < 0 ? '−' : '') + formatMoney(abs - (abs % 100), currency);
  const cents = '.' + (abs % 100).toString().padStart(2, '0');
  const changeColor = up ? c.ink : c.down;

  const heroBlock = (
    <View style={{ gap: space[2] }}>
      {model.source === 'demo' && <Txt v="small" c="ink2">Net worth, cash flow and what needs you, on every device.</Txt>}
      {model.available ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Odometer text={mask(whole)} style={{ ...hero, color: c.ink, fontVariant: ['tabular-nums'] }} fast={scrub !== null} />
          <Odometer text={mask(cents)} style={{ ...typeScale.cents, color: c.ink2, fontVariant: ['tabular-nums'] }} fast={scrub !== null} />
        </View>
      ) : (
        <Txt style={{ ...hero, color: c.ink2 }} accessibilityLabel="Total unavailable">—</Txt>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[3] }}>
        {!model.available ? (
          <Txt v="body" c="ink2">Totals need today’s exchange rate.</Txt>
        ) : showChange ? (
          <Pressable onPress={openMovers} accessibilityRole="button" hitSlop={8} accessibilityHint="Explains this change"
            style={{ minHeight: 32, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space[2] }}>
            <Txt v="figure" style={{ color: changeColor }}>{mask((up ? '▲ ' : '▼ ') + formatMoney(Math.abs(diff), currency, { cents: true }) + (values[0] ? ' ' + formatPercent(diff / Math.abs(values[0])) : ''))}</Txt>
            {/* A picked date shows above the chart, by the point; here only the change since the start. */}
            {scrub === null && <Txt v="body" c="ink2">{rangeWords(range, points[0].t)} ›</Txt>}
          </Pressable>
        ) : (
          model.empty ? null : <Txt v="body" c="ink2">{lens !== 'net' && !chartFollowsLens ? 'Today' : 'History starts today'}</Txt>
        )}
        {preview === null && pinned !== null && (
          <Pressable onPress={unpin} accessibilityRole="button" accessibilityLabel="Back to today" hitSlop={8}
            style={{ minHeight: 32, paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.s2, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Txt v="small" style={{ fontFamily: 'Manrope_700Bold' }} maxFontSizeMultiplier={1.4}>Back to today</Txt>
            <Txt v="small" c="ink2" maxFontSizeMultiplier={1.4}>✕</Txt>
          </Pressable>
        )}
        {scrub === null && model.live && range === '1D' && model.available && (
          <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View style={{ width: space[2], height: space[2], borderRadius: space[1], backgroundColor: c.ink2 }} />
            <Txt v="small" c="ink2">{model.source === 'demo' ? 'Sample data' : 'Live'}</Txt>
          </View>
        )}
      </View>
    </View>
  );

  const pickRange = (r: Range) => { setRange(r); unpin(); };
  const rangePills = <Choice options={ranges} value={range} onChange={pickRange} label={(r) => r} size="small" />;

  const chartHeight = wide ? CHART_WIDE : CHART_PHONE;
  const showChart = model.available && !model.empty;
  const chart = showChart ? (
    <View style={{ marginHorizontal: wide ? 0 : -GUTTER }}>
      <ScrubChart values={values} times={model.source === 'cloud' ? points.map((p) => p.t) : undefined} height={chartHeight} color={changeColor} track={c.ink2} drawKey={range + (chartFollowsLens ? lens : 'net')} pinned={pinned}
        labels={{ times: points.map((p) => p.t), at: (i) => pointLabel(points[i].t, range, model.now), tick: (t) => tickLabel(t, range) }}
        onPreview={(i) => { setPreview(i); if (i !== null && coach) seeTip(COACH); }}
        onPin={(i) => { setPreview(null); setPinnedAt(i >= points.length - 1 ? null : points[i].t); if (coach) seeTip(COACH); }} />
      {coach && <CoachTip title="Drag the line to go back in time" body="Let go to stay on that date, then tap a block to see what was in it." top={chartHeight * 0.45} availableHeight={chartHeight} width={wide ? 1000 : width} onDismiss={() => seeTip(COACH)} />}
    </View>
  ) : null;

  const blocks = model.empty ? (
    <Message title="Nothing tracked yet" body="Add a cash balance to see your net worth. Enter a sentence like “Bank balance 100”, press Send, check the draft, then press Save." action={model.source === 'cloud' ? <View style={{ gap: space[2] }}>
      <Button label="Add your first account" onPress={() => router.push('/ask')} />
      <Link href="/import" asChild><Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Or import a spreadsheet ›</Txt></Pressable></Link>
    </View> : undefined} />
  ) : model.available ? (
    <View style={{ gap: space[2] }}>
      <CompositionBar {...composition} items={model.items} lens={lens} wide={wide} when={scrub !== null && idx < points.length - 1 ? pointLabel(points[idx].t, range, model.now) : undefined}
        onOpen={openDay ? (cat) => openDay(dayGroupOf(cat)) : undefined} />
      {notes[lens] ? <Txt v="small" c="ink2">{notes[lens]}</Txt> : null}
      {summary.unknown.length > 0 && <Txt v="small" c="ink2">{summary.unknown.length} without a value {summary.unknown.length === 1 ? 'is' : 'are'} left out.</Txt>}
      {lens === 'liquid' && <LiquidBreakdown summary={summary} pledged={model.pledged} invested={model.invested} />}
      {lens !== 'net' && !chartFollowsLens && <Txt v="small" c="ink2">{lensLabel(lens)}{lens === 'liquid' ? ' after debts' : ''} today: {money(lensNow)}. The chart shows net worth.</Txt>}
    </View>
  ) : null;

  // Dragging the chart re-renders this screen on every move. These sections don't follow the finger.
  const cloudTeasers = model.source === 'cloud' && !model.empty;
  const cards = useMemo(() => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {cloudTeasers && <MoneyMapTeaser style={tile} />}
      {cloudTeasers && <EarningsTeaser style={tile} />}
      <MonthTeaser month={model.month} flow={model.flow} style={tile} />
    </View>
  ), [cloudTeasers, model.month, model.flow]);
  const needs = useMemo(() => <NeedsYou items={model.attention} readOnly={model.source === 'demo'} />, [model.attention, model.source]);

  // One column at every width: the answer, then why (own against owe), then what to do, then the details.
  return shell(
    <View style={{ gap: wide ? space[8] : space[6] }}>
      <View style={{ gap: wide ? space[4] : space[3] }}>
        {wide ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[4] }}>{heroBlock}{showChart && rangePills}</View>
        ) : heroBlock}
        {chart}
        {!wide && showChart && rangePills}
      </View>
      {blocks}
      {needs}
      {cards}
    </View>,
  );
}
