import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { parseDate } from '@/ask/parse';
import type { CloudTransaction } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { useWriter } from '@/data/writes';
import { shortDay } from '@/domain/freshness';
import { formatMoney } from '@/domain/money';
import { txDeletePlan, txEditPlan, txFields, txProblems, type TxFields } from '@/flow/txPlan';
import { useTheme } from '@/theme/theme';
import { Field, Seg, toCents } from '@/ui/form';
import { useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** One transaction: what it was, when, and in which category; edit or delete with Undo. */
export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to see your transactions.</Txt></Screen>;
  return <Loaded id={id} />;
}

function Loaded({ id }: { id: string }) {
  const cloud = useCloudData();
  if (cloud.status !== 'ready') return <Screen><ActivityIndicator style={{ marginTop: 60 }} accessibilityLabel="Loading" /></Screen>;
  const tx = cloud.snapshot.transactions.find((t) => t.id === id);
  if (!tx) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>This transaction isn’t here anymore. It may have been deleted.</Txt></Screen>;
  return <Screen><Detail key={tx.id} tx={tx} now={cloud.now} portfolioId={cloud.portfolioId} categories={cloud.snapshot.categories} /></Screen>;
}

function Detail({ tx, now, portfolioId, categories }: { tx: CloudTransaction; now: number; portfolioId: string; categories: { id: string; name: string; kind: 'income' | 'expense' }[] }) {
  const { c } = useTheme();
  const { mask } = useMoney();
  const run = useWriter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TxFields>(() => txFields(tx));
  const [amount, setAmount] = useState(() => (Math.abs(tx.amountMinor) / 100).toFixed(2));
  const [day, setDay] = useState(() => shortDay(tx.occurredAt, 0));
  const income = tx.kind === 'income';
  const category = categories.find((x) => x.id === tx.categoryId)?.name ?? null;
  const parsedDay = day.trim() ? parseDate(day, new Date(now), 'past') : null;
  const problems = [...txProblems(form), ...(parsedDay ? [] : ['Add a date, like 3 Oct.'])];
  const choices = categories.filter((x) => x.kind === form.kind);

  async function save() {
    setBusy(true); setError(null);
    try {
      const keepTime = parsedDay && new Date(parsedDay.at).toDateString() === new Date(tx.occurredAt).toDateString();
      const p = txEditPlan(tx, { ...form, occurredAt: keepTime ? tx.occurredAt : parsedDay!.at });
      await run(p.apply);
      setEditing(false);
      toast({ text: `${form.description.trim()} saved`, action: { label: 'Undo', onPress: async () => { try { await run(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch { setError('Couldn’t save. Check the details and try again.'); } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const p = txDeletePlan(tx, portfolioId);
      await run(p.apply);
      router.back();
      toast({ text: `${tx.description} deleted`, action: { label: 'Undo', onPress: async () => { try { await run(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch { setBusy(false); setConfirming(false); setError('Couldn’t delete. Try again.'); }
  }

  return (
    <View>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>{income ? 'INCOME' : 'SPENDING'}</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>{tx.description}</Txt>
      <Txt v="figure" style={{ marginTop: 10, fontSize: 34, lineHeight: 40, color: income ? c.upInk : c.ink }}>{mask((income ? '+' : '−') + formatMoney(Math.abs(tx.amountMinor), tx.currency, { cents: true }))}</Txt>
      <Txt v="body" c="ink2" style={{ marginTop: 6 }}>{[category, shortDay(tx.occurredAt, now)].filter(Boolean).join(' · ')}</Txt>

      {editing && (
        <View style={{ marginTop: 22, gap: 12 }}>
          <Seg label="Kind" options={[['expense', 'Spent'], ['income', 'Received']]} value={form.kind} onChange={(k) => setForm((f) => ({ ...f, kind: k, categoryId: null }))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Field label="What for" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} />
            <Field label="Amount" numeric value={amount} onChangeText={(t) => { setAmount(t); setForm((f) => ({ ...f, amountCents: toCents(t) ?? 0 })); }} />
            <Field label="Date" value={day} onChangeText={setDay} />
          </View>
          <View style={{ gap: 6 }}>
            <Txt v="small" c="ink3">Category</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
              {[{ id: null as string | null, name: 'None' }, ...choices].map((x) => (
                <Pressable key={x.id ?? 'none'} onPress={() => setForm((f) => ({ ...f, categoryId: x.id }))} accessibilityRole="radio" aria-checked={form.categoryId === x.id} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: form.categoryId === x.id ? c.ink : c.s2 }}>
                  <Txt v="small" style={{ fontFamily: 'Manrope_700Bold', color: form.categoryId === x.id ? c.bg : c.ink }}>{x.name}</Txt>
                </Pressable>
              ))}
            </View>
          </View>
          <Seg label="Currency" options={[['EUR', '€ EUR'], ['USD', '$ USD']]} value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} />
          {problems.length > 0 && <Txt v="small" c="warn">{problems[0]}</Txt>}
        </View>
      )}
      {error && <Txt v="body" style={{ color: c.down, marginTop: 14 }} accessibilityRole="alert">{error}</Txt>}

      {confirming ? (
        <View style={{ marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 10 }}>
          <Txt v="cardTitle">Delete this transaction?</Txt>
          <Txt v="body" c="ink2">It leaves this month’s flow now. You can undo for a few seconds.</Txt>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={remove} disabled={busy} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.down, justifyContent: 'center' }}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Txt v="body" style={{ color: '#FFFFFF', fontFamily: 'Manrope_700Bold' }}>Delete</Txt>}
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt></Pressable>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 22, flexDirection: 'row', gap: 4 }}>
          {editing ? (
            <>
              <Pressable onPress={save} disabled={busy || problems.length > 0} accessibilityRole="button" aria-disabled={busy || problems.length > 0} style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: problems.length ? 0.4 : 1 }}>
                {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Save</Txt>}
              </Pressable>
              <Pressable onPress={() => { setEditing(false); setForm(txFields(tx)); setError(null); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt></Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => { setForm(txFields(tx)); setAmount((Math.abs(tx.amountMinor) / 100).toFixed(2)); setDay(shortDay(tx.occurredAt, 0)); setEditing(true); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center' }}><Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Edit</Txt></Pressable>
              <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Delete</Txt></Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}
