import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { parseDate } from '@/ask/parse';
import type { CloudLiability } from '@/cloud/api';
import { parseBought } from '@/data/editPlan';
import type { DebtEvent } from '@/data/moneyMap';
import { shortDay } from '@/domain/freshness';
import { accrual, isOverdue, paidTotals, type LoanTerms, type TermEvent } from '@/domain/loanTerms';
import { formatMoney } from '@/domain/money';
import { useTheme } from '@/theme/theme';
import { Field, Seg } from '@/ui/form';
import { useMoney } from '@/ui/money';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { eventErrorText, useTermsWrite } from './useMoneyMap';

export const termsOf = (l: CloudLiability): LoanTerms => ({
  principal: l.principal ?? null, startedAt: l.startedAt ?? null, dueKind: l.dueKind ?? null,
  interestTerms: l.interestTerms ?? null, interestRate: l.interestRate ?? null, dueDate: l.dueDate ?? null,
});
export const termEventOf = (e: DebtEvent): TermEvent => ({
  kind: e.kind, amount: e.amount, principalPart: e.principalPart ?? null, interestPart: e.interestPart ?? null, feePart: e.feePart ?? null, occurredAt: e.occurredAt,
});
export const hasTerms = (l: CloudLiability) => !!(l.principal || l.startedAt || l.dueKind || l.interestTerms);

/** Whether a debt is a plain money debt Numa can work interest out for. */
export const inCurrency = (l: CloudLiability) => !l.owedSymbol;

const major = (n: number, currency: CloudLiability['currency']) => formatMoney(Math.round(n * 100), currency, { cents: true });
const percent = (n: number) => `${Math.round(n * 100) / 100}%`;

/** A past date typed loosely: "2026-07-01", "Jul 2026", "today", "20 Sep". */
export const pastDate = (text: string, now: number) => parseBought(text, now) ?? parseDate(text, new Date(now), 'past')?.at ?? null;
/** A date that may be ahead: "2026-12-20" or "20 Dec". */
export const laterDate = (text: string, now: number) => {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (iso) { const at = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12); return new Date(at).getUTCMonth() === Number(iso[2]) - 1 ? at : null; }
  return parseDate(text, new Date(now), 'future')?.at ?? null;
};

function Row({ label, value, tone }: { label: string; value: string; tone?: 'down' | 'warn' }) {
  const { c } = useTheme();
  const { mask } = useMoney();
  return (
    <View style={{ minHeight: 34, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <Txt v="body" c="ink2" style={{ flexShrink: 1 }} maxFontSizeMultiplier={1.4}>{label}</Txt>
      <Txt v="figureSm" style={{ fontSize: 14, textAlign: 'right', flexShrink: 1, color: tone === 'down' ? c.down : tone === 'warn' ? c.warn : c.ink }} maxFontSizeMultiplier={1.4}>{mask(value)}</Txt>
    </View>
  );
}

/** One debt's terms, what has been paid, and the interest worked out from them. Interest accrued is not part of what is owed. */
export function LoanTermsCard({ loan, events, now, onEdit }: { loan: CloudLiability; events: DebtEvent[]; now: number; onEdit: () => void }) {
  const { c } = useTheme();
  const terms = termsOf(loan);
  const list = events.map(termEventOf);
  const a = accrual(terms, list, loan.balance, now);
  const paid = paidTotals(list);
  const overdue = isOverdue(terms, loan.balance, now);
  const money = (n: number) => major(n, loan.currency);
  const rate = terms.interestRate;
  const interest = terms.interestTerms === 'none' ? 'Interest-free'
    : terms.interestTerms === 'simple' ? (rate ? `${percent(rate)} a year, simple` : 'Simple, no rate yet')
    : terms.interestTerms === 'manual' ? 'Manual: Numa doesn’t calculate it'
    : 'Not set';
  return (
    <View style={{ marginTop: 14, backgroundColor: c.s1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
      <Txt v="cardTitle" accessibilityRole="header" style={{ marginBottom: 4 }}>{loan.name} · terms</Txt>
      {terms.principal !== null && <Row label="Original amount" value={money(terms.principal)} />}
      <Row label="Still owed (principal)" value={money(loan.balance)} />
      {terms.startedAt !== null && <Row label="Started" value={shortDay(terms.startedAt, now)} />}
      {terms.dueKind === 'fixed' && terms.dueDate !== null && <Row label="Repay by" value={`${shortDay(terms.dueDate, now)}${overdue ? ' · overdue' : ''}`} tone={overdue ? 'down' : undefined} />}
      {terms.dueKind === 'flexible' && <Row label="Repay by" value="No fixed date" />}
      <Row label="Interest" value={interest} />
      {a.status === 'ok' && (
        <>
          <Row label="Interest accrued" value={money(a.accrued)} />
          <Row label="Paid or added to the loan" value={money(a.settled)} />
          <Row label={a.owed < 0 ? 'Interest paid ahead' : 'Interest owed'} value={money(Math.abs(a.owed))} tone={a.owed > 0 ? 'warn' : undefined} />
          <Row label="Next interest" value={shortDay(a.nextAccrualAt, now)} />
        </>
      )}
      {a.status === 'incomplete' && <Txt v="small" c="warn" style={{ paddingVertical: 4 }}>Add {a.missing} to work out interest.</Txt>}
      {a.status === 'ok' && !a.reconciles && (
        <Txt v="small" c="warn" style={{ paddingVertical: 4 }}>The history says {money(a.historyPrincipal)} is outstanding but the balance is {money(loan.balance)}, so the interest may be off. Add the missing payments to the history, or correct the balance.</Txt>
      )}
      {paid.total > 0 && <Row label="Paid so far" value={`${money(paid.total)}${paid.interest > 0 || paid.fees > 0 ? ` (principal ${money(paid.principal)}, interest ${money(paid.interest)}, fees ${money(paid.fees)})` : ''}`} />}
      <Txt v="small" c="ink3" style={{ paddingTop: 4 }}>
        {terms.interestTerms === 'simple' ? 'Each completed month adds the yearly rate ÷ 12 on what was owed at its start. Interest accrued is not counted in What you owe.' : 'Terms you set here stay with this debt. What you owe above is the principal.'}
      </Txt>
      <Pressable onPress={onEdit} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{hasTerms(loan) ? 'Edit terms' : 'Set loan terms'}</Txt>
      </Pressable>
    </View>
  );
}

const dateText = (at: number | null) => (at === null ? '' : new Date(at).toISOString().slice(0, 10));
const rateNumber = (text: string) => Number(text.replace(',', '.').replace(/%/g, '').trim());

/** Original amount, start date, repayment date and interest for one debt. */
export function LoanTermsForm({ loan, now, onDone }: { loan: CloudLiability; now: number; onDone: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const save = useTermsWrite();
  const t = termsOf(loan);
  const [principal, setPrincipal] = useState(t.principal === null ? '' : String(t.principal));
  const [started, setStarted] = useState(dateText(t.startedAt));
  const [dueKind, setDueKind] = useState<'fixed' | 'flexible' | 'none'>(t.dueKind ?? 'none');
  const [due, setDue] = useState(dateText(t.dueDate));
  const [interest, setInterest] = useState<'none' | 'simple' | 'manual' | 'unset'>(t.interestTerms ?? 'unset');
  const [rate, setRate] = useState(t.interestRate === null ? '' : String(t.interestRate));
  const [busy, setBusy] = useState(false);
  const coin = !inCurrency(loan);

  const principalN = principal.trim() === '' ? null : Number(principal.replace(/[\s,]/g, ''));
  const startedAt = started.trim() === '' ? null : pastDate(started, now);
  const dueAt = due.trim() === '' ? null : laterDate(due, now) ?? pastDate(due, now);
  const rateN = rate.trim() === '' ? null : rateNumber(rate);
  const problem =
    principalN !== null && !(Number.isFinite(principalN) && principalN > 0) ? 'The original amount must be more than zero.'
    : started.trim() !== '' && startedAt === null ? 'That start date isn’t a past date. Try 2026-07-01.'
    : dueKind === 'fixed' && dueAt === null ? 'A fixed loan needs a repayment date, like 2026-12-20.'
    : interest === 'simple' && !(rateN !== null && Number.isFinite(rateN) && rateN > 0 && rateN <= 100) ? 'Simple interest needs a yearly rate above 0 and up to 100.'
    : interest === 'simple' && (principalN === null || startedAt === null) ? 'Simple interest needs the original amount and the start date.'
    : null;

  async function submit() {
    if (problem) return;
    setBusy(true);
    try {
      await save(loan.id, {
        principal: coin ? undefined : principalN,
        startedAt: coin ? undefined : startedAt,
        dueKind: dueKind === 'none' ? null : dueKind,
        dueDate: dueKind === 'fixed' ? dueAt : null,
        interestTerms: interest === 'unset' ? null : interest,
        interestRate: interest === 'simple' ? rateN : null,
      });
      toast({ text: 'Terms saved' });
      onDone();
    } catch (e) { toast({ text: eventErrorText(e) }); }
    setBusy(false);
  }

  return (
    <View style={{ marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
      <Txt v="cardTitle">{loan.name} · loan terms</Txt>
      {!coin && <Field label={`Original amount in ${loan.currency}`} numeric value={principal} onChangeText={setPrincipal} />}
      {!coin && <Field label="Started (like 2026-07-01 or Jul 2026)" value={started} onChangeText={setStarted} />}
      <Seg label="Repayment" options={[['none', 'Not set'], ['flexible', 'Flexible'], ['fixed', 'Fixed date']]} value={dueKind} onChange={setDueKind} />
      {dueKind === 'fixed' && <Field label="Repay by (like 2026-12-20)" value={due} onChangeText={setDue} />}
      <Seg label="Interest" options={coin ? [['unset', 'Not set'], ['none', 'None'], ['manual', 'Manual']] : [['unset', 'Not set'], ['none', 'None'], ['simple', 'Simple'], ['manual', 'Manual']]} value={interest} onChange={setInterest} />
      {interest === 'simple' && <Field label="Yearly rate in percent" numeric value={rate} onChangeText={setRate} />}
      {interest === 'manual' && <Txt v="small" c="ink3">For compounding or fixed instalments. Numa keeps the label and calculates nothing.</Txt>}
      {interest === 'simple' && <Txt v="small" c="ink3">Each completed month adds the yearly rate ÷ 12 on what was owed at its start. Check it against your agreement.</Txt>}
      {coin && <Txt v="small" c="ink3">This debt is owed in a coin, so Numa doesn’t keep an original amount or work out interest for it.</Txt>}
      {problem && <Txt v="small" c="warn" accessibilityRole="alert">{problem}</Txt>}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable onPress={submit} disabled={!!problem || busy} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: !problem && !busy ? c.ink : c.s2, justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c={!problem ? 'bg' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>Save terms</Txt>}
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" c="ink2">Cancel</Txt></Pressable>
      </View>
    </View>
  );
}
