import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { newMutationId } from '@/data/cloud';
import { historyOf, partyOf, type DebtEvent, type Party, type PartyRecord } from '@/data/moneyMap';
import { shortDay } from '@/domain/freshness';
import { LoanTermsCard, LoanTermsForm } from '@/loans/LoanTermsCard';
import { PaymentForm, unitText } from '@/loans/PaymentForm';
import { hasTerms } from '@/loans/termsHelpers';
import { useLoans } from '@/loans/useLoans';
import { eventErrorText, useDebtWrites, useMoneyMap, type MoneyMapState } from '@/loans/useMoneyMap';
import { useTheme } from '@/theme/theme';
import { Field, Seg, toCents } from '@/ui/form';
import { CurrencyScope, useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** One person, company or protocol: every debt with them, where their money sits, and what happened. */
export default function PersonScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to see your money map.</Txt></Screen>;
  return <Cloud partyKey={key} />;
}

function Cloud({ partyKey }: { partyKey: string }) {
  const state = useMoneyMap();
  if (state.status !== 'ready') return <Screen back="Money map"><View style={{ marginTop: 60, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View></Screen>;
  const party = partyOf(state.map, partyKey);
  if (!party) return <Screen back="Money map"><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Nothing is owed here anymore.</Txt></Screen>;
  return <CurrencyScope currency={state.currency}><Detail party={party} state={state} /></CurrencyScope>;
}

const KIND_WORDS: Record<DebtEvent['kind'], string> = { borrowed: 'Borrowed', repaid: 'Paid back', lent: 'Lent', received: 'Got back', note: 'Note', capitalized: 'Interest added' };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: 14, backgroundColor: c.s1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
      <Txt v="cardTitle" accessibilityRole="header" style={{ marginBottom: 4 }}>{title}</Txt>
      {children}
    </View>
  );
}

function RecordRow({ r, last }: { r: PartyRecord; last: boolean }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  return (
    <Pressable onPress={() => router.push(r.open as never)} accessibilityRole="link" accessibilityLabel={`${r.amount}, ${r.name}. Open`}
      style={{ minHeight: 54, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line2 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{mask(r.amount)}</Txt>
        <Txt v="small" c="ink2" numberOfLines={1}>{r.name}</Txt>
      </View>
      <Txt v="figureSm" style={{ fontSize: 14 }}>{r.cents === null ? '—' : money(r.cents)}</Txt>
      <Txt v="body" c="ink3">›</Txt>
    </Pressable>
  );
}

/** Where the money of these debts sits, when a debt was linked to a place. */
function Sits({ party }: { party: Party }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const loans = useLoans();
  if (loans.status !== 'ready') return null;
  const subjects = new Set(party.records.map((r) => r.subject));
  const places = loans.loans.filter((l) => subjects.has(l.key)).flatMap((l) => l.deployed.map((p) => ({ p, result: l.deployed.length === 1 ? l.resultCents : null })));
  if (!places.length) return null;
  return (
    <Card title={party.owed === 'toYou' ? 'Where it went' : 'Where the money sits'}>
      {places.map(({ p, result }, i) => (
        <View key={p.key} style={{ minHeight: 54, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: i === places.length - 1 ? 0 : 1, borderBottomColor: c.line2 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{p.name}</Txt>
            {p.detail && <Txt v="small" c="ink2" numberOfLines={1}>{p.detail}</Txt>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt v="figureSm" style={{ fontSize: 14 }}>{p.valueCents === null ? '—' : money(p.valueCents)}</Txt>
            {result !== null && <Txt v="small" style={{ color: result >= 0 ? c.upInk : c.down }}>{money(result, { sign: true })} so far</Txt>}
          </View>
        </View>
      ))}
    </Card>
  );
}

function Detail({ party, state }: { party: Party; state: Extract<MoneyMapState, { status: 'ready' }> }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const toast = useToast();
  const writes = useDebtWrites(state.portfolioId);
  const [form, setForm] = useState<'payment' | 'debt' | null>(null);
  const [termsFor, setTermsFor] = useState<string | null>(null);
  const history = historyOf(party, state.events);
  const byYou = party.owed === 'byYou';
  const person = party.kind === 'person';
  const kindLabel = byYou ? (person ? 'YOU OWE · PERSON' : 'YOU OWE · PROTOCOL') : 'OWED TO YOU';

  async function undoable(work: () => Promise<string>, text: string) {
    try {
      const id = await work();
      toast({ text, action: { label: 'Undo', onPress: async () => { try { await writes.remove(id); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
      return true;
    } catch (e) { toast({ text: eventErrorText(e) }); return false; }
  }
  async function removeEvent(e: DebtEvent) {
    try { await writes.remove(e.id); toast({ text: e.applied ? 'Removed, and the amount is back on the debt' : 'Removed' }); }
    catch (err) { toast({ text: eventErrorText(err) }); }
  }

  return (
    <Screen back="Money map">
      <Txt v="label" c="ink3" style={{ marginTop: 6 }}>{kindLabel}</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>{party.name}</Txt>
      <Txt v="figure" style={{ marginTop: 8, fontSize: 34, lineHeight: 40, color: byYou ? c.down : c.upInk }}>{party.cents === null ? '—' : money(party.cents, { cents: true })}</Txt>
      <Txt v="body" c="ink2">{party.detail}</Txt>
      {party.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 4 }}>{party.unknown} without a value {party.unknown === 1 ? 'is' : 'are'} left out.</Txt>}

      <Card title={byYou ? (person ? 'Debts' : 'Loans') : 'Money lent'}>
        {party.records.map((r, i) => <RecordRow key={r.subject} r={r} last={i === party.records.length - 1} />)}
      </Card>

      <Sits party={party} />

      {person && byYou && party.records.filter((r) => r.loan).map((r) => (
        termsFor === r.subject
          ? <LoanTermsForm key={r.subject} loan={r.loan!} events={state.events.filter((e) => e.subject === r.subject)} portfolioId={state.portfolioId} now={state.now} onDone={() => setTermsFor(null)} />
          : hasTerms(r.loan!)
            ? <LoanTermsCard key={r.subject} loan={r.loan!} events={state.events.filter((e) => e.subject === r.subject)} now={state.now} onEdit={() => setTermsFor(r.subject)} />
            : null
      ))}

      {person && (
        <Card title="History">
          {history.length === 0 && <Txt v="body" c="ink2" style={{ paddingBottom: 6 }}>Nothing recorded yet. Record a payment and it shows here with its date.</Txt>}
          {history.map((e, i) => {
            const record = party.records.find((r) => r.subject === e.subject);
            return (
              <View key={e.id} style={{ minHeight: 48, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: i === history.length - 1 ? 0 : 1, borderBottomColor: c.line2 }}>
                <Txt v="figureSm" c="ink3" style={{ width: 62, fontSize: 12 }}>{shortDay(e.occurredAt, state.now)}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="body">{KIND_WORDS[e.kind]}{e.amount !== null && e.unit ? ` ${unitText(e.amount, e.unit)}` : ''}</Txt>
                  {e.unit && (e.interestPart || e.feePart) ? <Txt v="small" c="ink2" numberOfLines={2}>{`Principal ${unitText(e.principalPart ?? 0, e.unit)} · Interest ${unitText(e.interestPart ?? 0, e.unit)} · Fees ${unitText(e.feePart ?? 0, e.unit)}`}</Txt> : null}
                  {(e.note || party.records.length > 1) && <Txt v="small" c="ink2" numberOfLines={2}>{[e.note, party.records.length > 1 ? record?.name : null].filter(Boolean).join(' · ')}</Txt>}
                </View>
                <Pressable onPress={() => removeEvent(e)} accessibilityRole="button" accessibilityLabel={`Remove ${KIND_WORDS[e.kind]} from ${shortDay(e.occurredAt, state.now)}`} hitSlop={6}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="body" c="ink3" style={{ fontSize: 18 }}>×</Txt>
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      {person && form === 'payment' && <PaymentForm party={party} events={state.events} now={state.now} onCancel={() => setForm(null)} onSave={async (e) => { if (await undoable(() => writes.add(e), 'Saved')) setForm(null); }} />}
      {person && form === 'debt' && <NewDebtForm party={party} portfolioId={state.portfolioId} currency={state.currency} onDone={() => setForm(null)} />}
      {person && form === null && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
          {party.records.some((r) => r.unit) && (
            <Pressable onPress={() => setForm('payment')} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center' }}>
              <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>{byYou ? 'Record a payment' : 'Record money back'}</Txt>
            </Pressable>
          )}
          <Pressable onPress={() => setForm('debt')} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{byYou ? 'Add a debt' : 'Add money lent'}</Txt>
          </Pressable>
          {byYou && party.records.filter((r) => r.loan && !hasTerms(r.loan) && termsFor !== r.subject).map((r) => (
            <Pressable key={r.subject} onPress={() => setTermsFor(r.subject)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{party.records.length > 1 ? `Set terms for ${r.name}` : 'Set loan terms'}</Txt>
            </Pressable>
          ))}
        </View>
      )}
      {!person && <Txt v="small" c="ink3" style={{ marginTop: 14 }}>Read from the protocol. Open a loan to see what backs it.</Txt>}
    </Screen>
  );
}

/** Another debt with this party, or more money lent to them. */
function NewDebtForm({ party, portfolioId, currency, onDone }: { party: Party; portfolioId: string; currency: 'EUR' | 'USD'; onDone: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const upsertLiability = useMutation(cloud.upsertLiability);
  const upsertAsset = useMutation(cloud.upsertAsset);
  const byYou = party.owed === 'byYou';
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<'EUR' | 'USD'>(currency);
  const [busy, setBusy] = useState(false);
  const cents = toCents(amount);
  const ok = cents !== null && cents > 0 && !busy;
  async function save() {
    if (cents === null) return;
    setBusy(true);
    try {
      const balance = cents / 100;
      if (byYou) await upsertLiability({ portfolioId, name: party.name, kind: 'loan', balance, currency: cur, counterparty: party.name, clientMutationId: newMutationId('numa.addDebt') });
      else await upsertAsset({ portfolioId, name: `Loan to ${party.name}`, kind: 'other', balance, currency: cur, owedBy: party.name, clientMutationId: newMutationId('numa.addLent') });
      toast({ text: 'Added' });
      onDone();
    } catch { toast({ text: 'Couldn’t add that. Check your connection and try again.' }); }
    setBusy(false);
  }
  return (
    <View style={{ marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
      <Txt v="cardTitle">{byYou ? `New debt to ${party.name}` : `More lent to ${party.name}`}</Txt>
      <Field label="Amount" numeric value={amount} onChangeText={setAmount} />
      <Seg label="Currency" options={[['EUR', 'EUR'], ['USD', 'USD']]} value={cur} onChange={setCur} />
      <Txt v="small" c="ink3">A debt in a coin, like BTC or USDC, can be added from Ask or by an agent.</Txt>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable onPress={save} disabled={!ok} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: ok ? c.ink : c.s2, justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c={ok ? 'bg' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>Add</Txt>}
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" c="ink2">Cancel</Txt></Pressable>
      </View>
    </View>
  );
}
