import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { bindUndo } from '@/ask/plan';
import { parseDate } from '@/ask/parse';
import type { CloudCategory, CloudGoal } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { demoDebts, demoHoldings, demoNow, demoOctober } from '@/data/demo';
import { useWriter } from '@/data/writes';
import { summarizeFlow } from '@/domain/flow';
import { shortDay } from '@/domain/freshness';
import { countedValue, summarize } from '@/domain/summary';
import type { Currency } from '@/domain/types';
import { goalCreatePlan, goalDeletePlan, goalRows, limitPlan, limits, runway, runwayWords, type GoalFields, type GoalRow, type LimitRow } from '@/plan/plan';
import { useTheme } from '@/theme/theme';
import { Field, Seg, toCents } from '@/ui/form';
import { CurrencyScope, useMoney } from '@/ui/money';
import { BarButtons, PinnedScreen } from '@/ui/PinnedScreen';
import { useToast } from '@/ui/Toast';
import { Hint } from '@/ui/Hint';
import { Txt } from '@/ui/Txt';

type PlanData = {
  demo: boolean; currency: Currency; now: number;
  runway: { cashCents: number; monthlyOutCents: number | null; months: number | null; basisMonths: number };
  goals: GoalRow[]; limits: LimitRow[]; portfolioId: string | null;
};

export default function PlanScreen() { return useSession().kind === 'signedIn' ? <CloudPlan /> : <DemoPlan />; }

function DemoPlan() {
  const data = useMemo<PlanData>(() => {
    const summary = summarize(demoHoldings, demoDebts, demoNow);
    const out = summarizeFlow(demoOctober).outCents;
    const g = (id: string, title: string, currentCents: number, targetCents: number): GoalRow => ({ goal: { id, scope: 'net_worth', target: targetCents / 100, currency: 'EUR', startAt: 0, deadline: new Date(2027, 11, 31).getTime(), label: title, categoryId: null, assetId: null, holdingId: null, createdAt: 0 }, title, currentCents, targetCents, share: currentCents / targetCents });
    return { demo: true, currency: 'EUR', now: demoNow.getTime(), portfolioId: null, limits: [],
      runway: { cashCents: summary.cashCents, monthlyOutCents: out, months: summary.cashCents / out, basisMonths: 3 },
      goals: [g('d1', 'Net worth €1M', summary.netCents, 100_000_000), g('d2', 'MRR €10k', 1_142_000, 1_000_000)] };
  }, []);
  return <PlanView data={data} />;
}

function CloudPlan() {
  const cloud = useCloudData();
  const data = useMemo<PlanData | null>(() => {
    if (cloud.status !== 'ready') return null;
    const { snapshot, data: home, summary, fx, now } = cloud;
    const date = new Date(now);
    const values = new Map(home.holdings.map((h) => [h.id, countedValue(h.valuation)?.cents ?? null]));
    return {
      demo: false, currency: home.currency, now, portfolioId: cloud.portfolioId,
      runway: runway(snapshot, summary, home.currency, fx, date),
      goals: goalRows(snapshot, summary, home.currency, fx, date, (id) => values.get(id) ?? null),
      limits: limits(snapshot, home.currency, fx, date),
    };
  }, [cloud]);
  if (!data) return <Shell><ActivityIndicator style={{ marginTop: 60 }} accessibilityLabel="Loading" /></Shell>;
  return <PlanView data={data} />;
}

/** Plan's page inside the shared pinned bar. */
function Shell({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  return (
    <PinnedScreen maxWidth={760} keyboard
      nav={(compact) => compact
        ? <Txt v="body" accessibilityRole="header" numberOfLines={1} style={{ fontFamily: 'Manrope_700Bold', fontSize: 17 }} maxFontSizeMultiplier={1.2}>Plan</Txt>
        : <Txt v="title" accessibilityRole="header">Plan</Txt>}
      buttons={(compact) => <BarButtons demo={demo} compact={compact} />}>
      {children}
    </PinnedScreen>
  );
}

function Bar({ share, tone }: { share: number; tone: 'ok' | 'warn' | 'over' | 'done' }) {
  const { c } = useTheme();
  const fill = { ok: c.ink, warn: c.warn, over: c.down, done: c.up }[tone];
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.s2, overflow: 'hidden', marginTop: 8 }}>
      <View style={{ width: `${Math.min(100, Math.max(0, share * 100))}%`, height: 8, borderRadius: 4, backgroundColor: fill }} />
    </View>
  );
}

function PlanView({ data }: { data: PlanData }) { return <CurrencyScope currency={data.currency}><Inner data={data} /></CurrencyScope>; }

function Inner({ data }: { data: PlanData }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const r = data.runway;
  return (
    <Shell demo={data.demo}>
      <View style={{ marginTop: 4, padding: 18, borderRadius: 20, backgroundColor: c.s1 }}>
        <Txt v="small" c="ink3">RUNWAY</Txt>
        <Txt v="title" style={{ marginTop: 4, color: r.months !== null && r.months < 3 ? c.down : c.ink }}>{runwayWords(r.months)}</Txt>
        <Txt v="body" c="ink2" style={{ marginTop: 6 }}>
          {r.monthlyOutCents === null ? `${money(r.cashCents)} in cash. Log a month of spending to see how long it lasts.` : `${money(r.cashCents)} in cash, spending about ${money(r.monthlyOutCents)} a month (last ${r.basisMonths === 1 ? 'month' : `${r.basisMonths} months`}).`}
        </Txt>
      </View>

      <Goals data={data} />
      <Limits data={data} />
    </Shell>
  );
}

function Goals({ data }: { data: PlanData }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ marginTop: 30 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt v="section" accessibilityRole="header">Goals</Txt>
        {!data.demo && !adding && <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Add a goal</Txt></Pressable>}
      </View>
      {adding && <GoalForm data={data} onDone={() => setAdding(false)} />}
      {data.goals.length === 0 && !adding && <Txt v="body" c="ink2" style={{ marginTop: 6 }}>No goals yet. A net-worth target or a monthly income goal keeps the numbers pointed somewhere.</Txt>}
      {data.goals.map((g) => {
        const done = g.share !== null && g.share >= 1;
        return (
          <Pressable key={g.goal.id} onPress={() => setOpen(open === g.goal.id ? null : g.goal.id)} accessibilityRole="button" accessibilityLabel={`${g.title}. ${g.share === null ? 'Progress unknown' : `${Math.round(g.share * 100)} percent`}`} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold', flex: 1 }}>{g.title}</Txt>
              <Txt v="figureSm" style={{ fontSize: 14, color: done ? c.upInk : c.ink }}>{g.share === null ? '—' : `${Math.round(g.share * 100)}%`}</Txt>
            </View>
            <Txt v="small" c="ink2" style={{ marginTop: 2 }}>
              {g.currentCents === null ? 'Progress unknown' : `${money(g.currentCents)} of ${g.targetCents === null ? '—' : money(g.targetCents)}`}{g.goal.deadline ? ` · by ${shortDay(g.goal.deadline, data.now)}` : ''}
            </Txt>
            {g.share !== null && <Bar share={g.share} tone={done ? 'done' : 'ok'} />}
            {open === g.goal.id && !data.demo && <GoalActions data={data} goal={g.goal} title={g.title} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function GoalActions({ data, goal, title }: { data: PlanData; goal: CloudGoal; title: string }) {
  const { c } = useTheme();
  const run = useWriter();
  const toast = useToast();
  return (
    <Pressable onPress={async () => {
      const p = goalDeletePlan(data.portfolioId!, goal);
      try { await run(p.apply); toast({ text: `${title} deleted`, action: { label: 'Undo', onPress: async () => { try { await run(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } }); }
      catch { toast({ text: 'Couldn’t delete that goal.' }); }
    }} accessibilityRole="button" style={{ marginTop: 10, minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' }}>
      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Delete goal</Txt>
    </Pressable>
  );
}

function GoalForm({ data, onDone }: { data: PlanData; onDone: () => void }) {
  const { c } = useTheme();
  const run = useWriter();
  const toast = useToast();
  const [f, setF] = useState<GoalFields>({ scope: 'net_worth', targetCents: 0, currency: data.currency, deadline: null, label: '' });
  const [amount, setAmount] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const due = by.trim() ? parseDate(by, new Date(data.now), 'future') : null;
  const bad = by.trim() !== '' && !due;
  const ok = f.targetCents > 0 && !bad;
  return (
    <View style={{ marginTop: 10, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
      <Seg label="Goal" options={[['net_worth', 'Net worth'], ['monthly_income', 'Monthly income']]} value={f.scope} onChange={(scope) => setF((x) => ({ ...x, scope }))} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Field label="Target" numeric value={amount} onChangeText={(t) => { setAmount(t); setF((x) => ({ ...x, targetCents: toCents(t) ?? 0 })); }} />
        <Field label="By (optional, like 31 Dec)" value={by} onChangeText={setBy} />
      </View>
      <Field label="Name (optional)" value={f.label} onChangeText={(label) => setF((x) => ({ ...x, label }))} />
      {bad && <Txt v="small" c="warn">That doesn’t look like a date.</Txt>}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable disabled={!ok || busy} onPress={async () => {
          setBusy(true);
          const p = goalCreatePlan(data.portfolioId!, { ...f, deadline: due?.at ?? null }, Date.now());
          try {
            const id = await run(p.apply);
            onDone();
            const undo = bindUndo(p.undo, id);
            toast({ text: 'Goal added', action: { label: 'Undo', onPress: async () => { try { await run(undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
          } catch { toast({ text: 'Couldn’t add that goal.' }); setBusy(false); }
        }} accessibilityRole="button" aria-disabled={!ok || busy} style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: ok ? 1 : 0.4 }}>
          <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Save goal</Txt>
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt></Pressable>
      </View>
    </View>
  );
}

function Limits({ data }: { data: PlanData }) {
  const { c } = useTheme();
  if (data.demo) return null;
  return (
    <View style={{ marginTop: 30 }}>
      <Txt v="section" accessibilityRole="header">Spending limits</Txt>
      <Txt v="small" c="ink2" style={{ marginTop: 2 }}>This month, per category. Needs you speaks up at 80% and when a limit is passed.</Txt>
      <Hint id="plan-limits" text="Tap a category to set its monthly limit." />
      {data.limits.length === 0 && <Txt v="body" c="ink2" style={{ marginTop: 8 }}>No spending categories yet.</Txt>}
      {data.limits.map((l, i) => <LimitRowView key={l.category.id} row={l} last={i === data.limits.length - 1} />)}
      <View style={{ height: 1, backgroundColor: c.line, opacity: 0 }} />
    </View>
  );
}

function LimitRowView({ row, last }: { row: LimitRow; last: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const run = useWriter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.limitCents ? (row.limitCents / 100).toFixed(0) : '');
  const tone = row.share === null ? 'ok' : row.share > 1 ? 'over' : row.share >= 0.8 ? 'warn' : 'ok';
  const save = async (cents: number | null) => {
    const p = limitPlan(row.category as CloudCategory, cents);
    try {
      await run(p.apply);
      setEditing(false);
      toast({ text: cents === null ? `${row.category.name} limit removed` : `${row.category.name} limit set`, action: { label: 'Undo', onPress: async () => { try { await run(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch { toast({ text: 'Couldn’t save that limit.' }); }
  };
  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Pressable onPress={() => setEditing((e) => !e)} accessibilityRole="button" accessibilityLabel={`${row.category.name}. ${row.limitCents === null ? 'No limit' : `${Math.round((row.share ?? 0) * 100)} percent of limit`}. Edit limit`}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{row.category.name}</Txt>
          <Txt v="figureSm" style={{ fontSize: 14, color: tone === 'over' ? c.down : tone === 'warn' ? c.warn : c.ink }}>{row.limitCents === null ? money(row.spentCents) : `${money(row.spentCents)} of ${money(row.limitCents)}`}</Txt>
        </View>
        {row.share !== null ? <Bar share={row.share} tone={tone} /> : <Txt v="small" c="ink3" style={{ marginTop: 2 }}>No limit · tap to set one</Txt>}
      </Pressable>
      {editing && (
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ width: 160 }}><Field label="Monthly limit" numeric value={text} onChangeText={setText} /></View>
          <Pressable disabled={!toCents(text)} onPress={() => save(toCents(text))} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: toCents(text) ? 1 : 0.4 }}><Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Save</Txt></Pressable>
          {row.limitCents !== null && <Pressable onPress={() => save(null)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Remove</Txt></Pressable>}
        </View>
      )}
    </View>
  );
}
