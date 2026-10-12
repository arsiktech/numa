import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CloudCategory, CloudTransaction } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { demoOctober } from '@/data/demo';
import { convertCents, type FxRate } from '@/data/fx';
import { summarizeFlow } from '@/domain/flow';
import { shortDay } from '@/domain/freshness';
import type { Currency, MonthFlow } from '@/domain/types';
import { availableMonths, monthFlow, monthName, monthOf, sameMonth, transactionsIn, type MonthKey } from '@/flow/month';
import { mrr, recurringRows, type RecurringRow } from '@/flow/recurring';
import { Sankey } from '@/flow/Sankey';
import { layoutSankey } from '@/flow/sankey';
import { useTheme } from '@/theme/theme';
import { CurrencyScope, useMoney } from '@/ui/money';
import { WIDE } from '@/ui/Nav';
import { Hint } from '@/ui/Hint';
import { Txt } from '@/ui/Txt';

type FlowData = {
  demo: boolean;
  currency: Currency;
  now: number;
  months: MonthKey[];
  flowFor: (k: MonthKey) => MonthFlow & { unconverted: string[] };
  txsFor: (k: MonthKey) => CloudTransaction[];
  categories: CloudCategory[];
  fx: FxRate | null;
  recurring: RecurringRow[];
};

export default function FlowScreen() {
  return useSession().kind === 'signedIn' ? <CloudFlow /> : <DemoFlow />;
}

function DemoFlow() {
  const now = new Date(2026, 9, 11);
  const data: FlowData = { demo: true, currency: 'EUR', now: now.getTime(), months: [monthOf(now.getTime())], flowFor: () => ({ ...demoOctober, unconverted: [] }), txsFor: () => [], categories: [], fx: null, recurring: [] };
  return <FlowView data={data} />;
}

function CloudFlow() {
  const cloud = useCloudData();
  const data = useMemo<FlowData | null>(() => {
    if (cloud.status !== 'ready') return null;
    const { snapshot, fx, now } = cloud;
    const currency = cloud.data.currency;
    const date = new Date(now);
    return {
      demo: false, currency, now, months: availableMonths(snapshot.transactions, date),
      flowFor: (k) => monthFlow(snapshot, k, currency, fx, date), txsFor: (k) => transactionsIn(snapshot.transactions, k, date),
      categories: snapshot.categories, fx, recurring: recurringRows(snapshot.recurring ?? [], currency, fx, now),
    };
  }, [cloud]);
  if (cloud.status === 'error') return <Shell><Txt v="body" c="ink2" style={{ marginTop: 20 }}>{cloud.message}</Txt></Shell>;
  if (!data) return <Shell><ActivityIndicator style={{ marginTop: 60 }} accessibilityLabel="Loading" /></Shell>;
  return <FlowView data={data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={wide ? { paddingHorizontal: 40, paddingTop: 22, paddingBottom: 60 } : { paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: insets.bottom + 150 }}>
      <View style={{ width: '100%', maxWidth: 1040, alignSelf: 'center' }}>{children}</View>
    </ScrollView>
  );
}

function FlowView({ data }: { data: FlowData }) {
  return <CurrencyScope currency={data.currency}><Inner data={data} /></CurrencyScope>;
}

function Inner({ data }: { data: FlowData }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [month, setMonth] = useState<MonthKey>(data.months[data.months.length - 1]);
  const [focus, setFocus] = useState<string | null>(null);
  const idx = data.months.findIndex((m) => sameMonth(m, month));
  const flow = data.flowFor(month);
  const sum = summarizeFlow(flow);
  const chartW = Math.min(wide ? 1040 : width - 40, 1040);
  const layout = layoutSankey(flow.incoming, flow.outgoing, chartW, wide ? 340 : 260);
  const lines = [...flow.incoming, ...flow.outgoing];
  const focused = lines.find((l) => l.id === focus) ?? null;
  const txs = data.txsFor(month).filter((t) => !focused || focused.txIds?.includes(t.id));
  const names = new Map(data.categories.map((x) => [x.id, x.name]));
  const go = (by: number) => { const next = data.months[idx + by]; if (next) { setMonth(next); setFocus(null); } };
  const products = mrr(data.recurring);
  const nothing = sum.inCents === 0 && sum.outCents === 0;

  return (
    <Shell>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="title" accessibilityRole="header">Flow</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => go(-1)} disabled={idx <= 0} accessibilityRole="button" accessibilityLabel="Previous month" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: idx <= 0 ? 0.3 : 1 }}><Txt v="section">‹</Txt></Pressable>
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', minWidth: 96, textAlign: 'center' }}>{monthName(month, new Date(data.now))}</Txt>
          <Pressable onPress={() => go(1)} disabled={idx >= data.months.length - 1} accessibilityRole="button" accessibilityLabel="Next month" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: idx >= data.months.length - 1 ? 0.3 : 1 }}><Txt v="section">›</Txt></Pressable>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        {nothing ? (
          <Txt v="section" c="ink2">Nothing logged in {flow.month}</Txt>
        ) : sum.keptCents >= 0 ? (
          <Txt v="title" style={{ color: c.upInk }}>You kept {money(sum.keptCents)}</Txt>
        ) : (
          <Txt v="title" style={{ color: c.down }}>{money(-sum.keptCents)} more out than in</Txt>
        )}
        <Txt v="body" c="ink2" style={{ marginTop: 4 }}>{hidden ? 'Amounts hidden' : `in ${money(sum.inCents)} · out ${money(sum.outCents)}${sum.inCents > 0 && sum.keptCents >= 0 ? ` · ${Math.round(sum.keptShare * 100)}% kept` : ''}`}</Txt>
        {flow.unconverted.length > 0 && <Txt v="small" c="warn" style={{ marginTop: 4 }}>{flow.unconverted.length} in another currency left out until today’s rate loads.</Txt>}
        {data.demo && <Txt v="small" c="ink3" style={{ marginTop: 4 }}>Demo data</Txt>}
      </View>

      {nothing ? (
        <View style={{ marginTop: 20, padding: 18, borderRadius: 20, backgroundColor: c.s1 }}>
          <Txt v="body" c="ink2">Tap the plus and type “Coffee 4.50” or “Got paid 3,000 from Client A”. The month’s streams show up here.</Txt>
        </View>
      ) : (
        <View style={{ marginTop: 22 }}>
          <Hint id="flow-follow" text="Tap a stream, or its chip, to follow it. The list below shows just its transactions." />
          <View style={{ height: 14 }} />
          <Sankey layout={layout} focus={focus} onFocus={setFocus} />
          {/* Every stream as a chip, so even ones too thin to label can be followed. */}
          <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel="Streams">
            {lines.map((l) => (
              <Pressable key={l.id} onPress={() => setFocus(focus === l.id ? null : l.id)} accessibilityRole="button" aria-selected={focus === l.id} accessibilityLabel={`${l.label}, ${hidden ? 'amount hidden' : money(l.cents)}. ${focus === l.id ? 'Following' : 'Follow this stream'}`}
                style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: focus === l.id ? c.ink : c.s1 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.id.startsWith('income:') ? c.up : c.ink3 }} />
                <Txt v="small" style={{ fontFamily: 'Manrope_700Bold', color: focus === l.id ? c.bg : c.ink }}>{l.label}</Txt>
                <Txt v="figureSm" style={{ color: focus === l.id ? c.bg : c.ink2 }}>{money(l.cents)}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {focused && (
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, backgroundColor: c.s1 }}>
          <View style={{ flex: 1 }}>
            <Txt v="small" c="ink3">FOLLOWING</Txt>
            <Txt v="cardTitle">{focused.label} · {money(focused.cents)}</Txt>
          </View>
          <Pressable onPress={() => setFocus(null)} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Clear</Txt></Pressable>
        </View>
      )}

      {!data.demo && txs.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <Txt v="section" accessibilityRole="header">{focused ? focused.label : 'Transactions'}</Txt>
          {txs.map((t, i) => {
            const cents = convertCents(Math.abs(t.amountMinor), t.currency, data.currency, data.fx);
            const income = t.kind === 'income';
            return (
              <Link key={t.id} href={{ pathname: '/tx/[id]', params: { id: t.id } }} asChild>
                <Pressable accessibilityRole="link" style={{ minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === txs.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{t.description}</Txt>
                    <Txt v="small" c="ink2" numberOfLines={1}>{[t.categoryId ? names.get(t.categoryId) : null, shortDay(t.occurredAt, data.now)].filter(Boolean).join(' · ')}</Txt>
                  </View>
                  <Txt v="figure" style={{ fontSize: 15, color: income ? c.upInk : c.ink }}>{cents === null ? '—' : (income ? '+' : '−') + money(cents, { cents: cents % 100 !== 0 }).replace('−', '')}</Txt>
                </Pressable>
              </Link>
            );
          })}
        </View>
      )}

      {products && (
        <View style={{ marginTop: 30, padding: 18, borderRadius: 20, backgroundColor: c.s1 }}>
          <Txt v="small" c="ink3">PRODUCTS AND MRR</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <Txt v="figure" style={{ fontSize: 28, lineHeight: 34 }}>{money(products.mrrCents)}</Txt>
            <Txt v="body" c="ink2">MRR · {money(products.arrCents)} a year</Txt>
          </View>
          {products.products.map((p) => (
            <View key={p.id} style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v="body">{p.description}</Txt>
              <Txt v="figureSm" style={{ fontSize: 14 }}>{p.monthlyCents === null ? '—' : money(p.monthlyCents)}</Txt>
            </View>
          ))}
          {products.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 8 }}>{products.unknown} in another currency left out until today’s rate loads.</Txt>}
        </View>
      )}

      {data.recurring.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <Txt v="section" accessibilityRole="header">Every month</Txt>
          {data.recurring.map((r, i) => (
            <View key={r.id} style={{ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === data.recurring.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <View style={{ flex: 1 }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{r.description}</Txt>
                <Txt v="small" c="ink2">{r.cadence === 'monthly' ? 'Monthly' : `${r.cadence[0].toUpperCase()}${r.cadence.slice(1)}, shown per month`} · next {shortDay(r.nextRunAt, data.now)}</Txt>
              </View>
              <Txt v="figureSm" style={{ fontSize: 14, color: r.kind === 'income' ? c.upInk : c.ink }}>{r.monthlyCents === null ? '—' : (r.kind === 'income' ? '+' : '−') + money(r.monthlyCents)}</Txt>
            </View>
          ))}
        </View>
      )}
    </Shell>
  );
}
