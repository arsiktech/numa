import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { CloudLiability } from '@/cloud/api';
import type { DebtEvent } from '@/data/moneyMap';
import { shortDay } from '@/domain/freshness';
import { accrual, isOverdue, paidTotals, parseAmount, type LoanTerms } from '@/domain/loanTerms';
import { formatMoney } from '@/domain/money';
import { useTheme } from '@/theme/theme';
import { Field, Seg } from '@/ui/form';
import { useMoney } from '@/ui/money';
import { amountText } from '@/ui/PositionRow';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { calendarToday, hasTerms, inCurrency, laterDate, pastDate, termEventOf, termsOf, unitOf } from './termsHelpers';
import { eventErrorText, useDebtWrites, useTermsWrite } from './useMoneyMap';

export { hasTerms, inCurrency, laterDate, pastDate, termEventOf, termsOf, unitOf } from './termsHelpers';

const major = (n: number, currency: CloudLiability['currency']) => formatMoney(Math.round(n * 100), currency, { cents: true });
const percent = (n: number) => `${Math.round(n * 100) / 100}%`;

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
  const coin = !inCurrency(loan);
  const unit = unitOf(loan);
  const list = events.map(termEventOf);
  const today = calendarToday(now);
  const a = accrual(terms, list, loan.balance, today);
  // Totals are only of payments in this debt's own currency or coin.
  const paid = paidTotals(list, unit);
  const overdue = isOverdue(terms, loan.balance, today);
  // A debt owed in a coin is shown in that coin, never as currency.
  const money = (n: number) => (coin ? `${amountText(n)} ${unit}` : major(n, loan.currency));
  const owedNow = coin ? `${amountText(loan.owedQuantity ?? 0)} ${unit}` : money(loan.balance);
  const rate = terms.interestRate;
  const interest = terms.interestTerms === 'none' ? 'Interest-free'
    : terms.interestTerms === 'simple' ? (rate ? `${percent(rate)} a year, simple` : 'Simple, no rate yet')
    : terms.interestTerms === 'manual' ? 'Manual: Numa doesn’t calculate it'
    : 'Not set';
  return (
    <View style={{ marginTop: 14, backgroundColor: c.s1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
      <Txt v="cardTitle" accessibilityRole="header" style={{ marginBottom: 4 }}>{loan.name} · terms</Txt>
      {terms.principal !== null && !coin && <Row label="Original amount" value={money(terms.principal)} />}
      <Row label="Still owed (principal)" value={owedNow} />
      {terms.startedAt !== null && <Row label="Started" value={shortDay(terms.startedAt, now)} />}
      {terms.dueKind === 'fixed' && terms.dueDate !== null && <Row label="Repay by" value={`${shortDay(terms.dueDate, now)}${overdue ? ' · overdue' : ''}`} tone={overdue ? 'down' : undefined} />}
      {terms.dueKind === 'flexible' && <Row label="Repay by" value="No fixed date" />}
      <Row label="Interest" value={interest} />
      {a.status === 'ok' && (
        <>
          <Row label="Interest accrued" value={money(a.accrued)} />
          <Row label="Paid or added to the loan" value={money(a.settled)} />
          <Row label={a.owed < 0 ? 'Interest paid ahead' : 'Interest owed'} value={money(Math.abs(a.owed))} tone={a.owed > 0 ? 'warn' : undefined} />
          <Row label="Running month so far (estimate)" value={money(a.running)} />
          {a.dueAt !== null
            ? <Row label={a.overdue ? 'Interest overdue since' : 'Next interest due'} value={shortDay(a.dueAt, now)} tone={a.overdue ? 'down' : undefined} />
            : <Row label="Next month completes" value={shortDay(a.nextAccrualAt, now)} />}
        </>
      )}
      {a.status === 'incomplete' && <Txt v="small" c="warn" style={{ paddingVertical: 4 }}>Add {a.missing} to work out interest.</Txt>}
      {a.status === 'ok' && !a.reconciles && (
        <Txt v="small" c="warn" style={{ paddingVertical: 4 }}>The history says {money(a.historyPrincipal)} is outstanding but the balance is {money(loan.balance)}, so the interest may be off. Add the missing payments to the history, or correct the balance.</Txt>
      )}
      {paid.total > 0 && <Row label="Paid so far" value={`${money(paid.total)}${paid.interest > 0 || paid.fees > 0 ? ` (principal ${money(paid.principal)}, interest ${money(paid.interest)}, fees ${money(paid.fees)})` : ''}`} />}
      <Txt v="small" c="ink3" style={{ paddingTop: 4 }}>
        {terms.interestTerms === 'simple' ? 'Each completed month adds the yearly rate ÷ 12 on what was owed at its start. The running month is an estimate and is not owed until it completes. Interest accrued is not counted in What you owe.' : 'Terms you set here stay with this debt. What you owe above is the principal.'}
      </Txt>
      <Pressable onPress={onEdit} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{hasTerms(loan) ? 'Edit terms' : 'Set loan terms'}</Txt>
      </Pressable>
    </View>
  );
}

const dateText = (at: number | null) => (at === null ? '' : new Date(at).toISOString().slice(0, 10));
type Changes = { principal?: number | null; startedAt?: number | null; dueKind?: 'fixed' | 'flexible' | null; interestTerms?: 'none' | 'simple' | 'manual' | null; interestRate?: number | null; interestDueDay?: number | null; dueDate?: number | null };
const REPRICES = ['principal', 'startedAt', 'interestRate', 'interestTerms'] as const;

/**
 * Original amount, start date, repayment date and interest for one debt. Only what you change is
 * saved, so a saved rate or date is never wiped by adding something else. Changing the rate, the
 * start date or the original amount of a loan with history recalculates its past interest, so the
 * form shows the difference first, asks you to confirm, and leaves a note in the history.
 */
export function LoanTermsForm({ loan, events, portfolioId, now, onDone }: { loan: CloudLiability; events: DebtEvent[]; portfolioId: string; now: number; onDone: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const save = useTermsWrite();
  const writes = useDebtWrites(portfolioId);
  const t = termsOf(loan);
  const coin = !inCurrency(loan);
  const noSimple = loan.kind === 'mortgage' || loan.kind === 'credit_card';
  // A debt that has only a repayment date or a rate from before loan terms existed starts as fixed or simple, with those values filled in.
  // Numa cannot work out interest on a mortgage, a card or a coin debt, so a rate on one of those starts as manual.
  const initial = {
    principal: t.principal === null ? '' : String(t.principal),
    started: dateText(t.startedAt),
    dueKind: (t.dueKind ?? (t.dueDate !== null ? 'fixed' : 'none')) as 'fixed' | 'flexible' | 'none',
    due: dateText(t.dueDate),
    interest: (t.interestTerms ?? (t.interestRate ? (coin || noSimple ? 'manual' : 'simple') : 'unset')) as 'none' | 'simple' | 'manual' | 'unset',
    rate: t.interestRate === null ? '' : String(t.interestRate),
    dueDay: t.interestDueDay ? String(t.interestDueDay) : '',
  };
  const [principal, setPrincipal] = useState(initial.principal);
  const [started, setStarted] = useState(initial.started);
  const [dueKind, setDueKind] = useState(initial.dueKind);
  const [due, setDue] = useState(initial.due);
  const [interest, setInterest] = useState(initial.interest);
  const [rate, setRate] = useState(initial.rate);
  const [dueDay, setDueDay] = useState(initial.dueDay);
  const [busy, setBusy] = useState(false);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const money = (n: number) => major(n, loan.currency);

  const principalN = principal.trim() === '' ? null : parseAmount(principal);
  const startedAt = started.trim() === '' ? null : pastDate(started, now);
  const dueAt = due.trim() === '' ? null : laterDate(due, now) ?? pastDate(due, now);
  const rateN = rate.trim() === '' ? null : parseAmount(rate.replace(/%/g, ''));
  const dueDayN = dueDay.trim() === '' ? null : parseAmount(dueDay);
  const problem =
    principalN !== null && !(Number.isFinite(principalN) && principalN > 0) ? 'The original amount must be more than zero.'
    : started.trim() !== '' && startedAt === null ? 'That start date isn’t a past date. Try 2026-07-01.'
    : dueKind === 'fixed' && dueAt === null ? 'A fixed loan needs a repayment date, like 2026-12-20.'
    : interest === 'simple' && !(rateN !== null && Number.isFinite(rateN) && rateN > 0 && rateN <= 100) ? 'Simple interest needs a yearly rate above 0 and up to 100.'
    : interest === 'simple' && dueDayN !== null && !(Number.isInteger(dueDayN) && dueDayN >= 1 && dueDayN <= 28) ? 'The due day must be a whole number from 1 to 28.'
    : interest === 'simple' && (principalN === null || startedAt === null) ? 'Simple interest needs the original amount and the start date.'
    : null;

  // Only what differs from what is saved.
  const changes: Changes = {};
  if (!coin && principal !== initial.principal) changes.principal = principalN;
  if (!coin && started !== initial.started) changes.startedAt = startedAt;
  // A loan from before loan terms existed shows as fixed or simple from its date or rate, but saved
  // nothing of the kind. Saving writes what the form shows, so the card and the form agree.
  const legacyDue = t.dueKind === null && dueKind === 'fixed';
  const legacyInterest = t.interestTerms === null && interest !== 'unset';
  if (dueKind !== initial.dueKind || due !== initial.due || legacyDue) {
    changes.dueKind = dueKind === 'none' ? null : dueKind;
    if (dueKind === 'fixed') { if (due !== initial.due || t.dueDate === null) changes.dueDate = dueAt; }
    // "Not set" and "Flexible" have no repayment date, so the saved one goes with the choice.
    else if (t.dueDate !== null) changes.dueDate = null;
  }
  if (interest !== initial.interest || rate !== initial.rate || legacyInterest) {
    if (interest !== initial.interest || legacyInterest) changes.interestTerms = interest === 'unset' ? null : interest;
    if (interest === 'simple') changes.interestRate = rateN;
    else if (interest === 'none') changes.interestRate = null;
  }
  if (interest === 'simple' && dueDay !== initial.dueDay) changes.interestDueDay = dueDayN;
  const nothing = Object.keys(changes).length === 0;
  const changesKey = JSON.stringify(changes);

  // What the change does to the interest already accrued, when it recalculates past months.
  const repricing = (() => {
    if (problem || !REPRICES.some((k) => k in changes)) return null;
    const list = events.map(termEventOf);
    const next: LoanTerms = {
      ...t,
      principal: changes.principal !== undefined ? changes.principal : t.principal,
      startedAt: changes.startedAt !== undefined ? changes.startedAt : t.startedAt,
      interestTerms: changes.interestTerms !== undefined ? changes.interestTerms : t.interestTerms,
      interestRate: changes.interestRate !== undefined ? changes.interestRate : t.interestRate,
    };
    const before = accrual(t, list, loan.balance, calendarToday(now));
    const after = accrual(next, list, loan.balance, calendarToday(now));
    if (before.status !== 'ok') return null;
    if (after.status !== 'ok') return `Interest will no longer be worked out. So far it was ${money(before.accrued)}.`;
    if (Math.abs(after.accrued - before.accrued) <= 0.005) return null;
    return `This recalculates the interest for months that have already passed: accrued so far goes from ${money(before.accrued)} to ${money(after.accrued)}. Check it against what you have already paid.`;
  })();
  const awaiting = repricing !== null && confirmedKey === changesKey;

  // A line for the history, so a change to terms that already existed is never silent.
  function noteOf(): string | null {
    const parts: string[] = [];
    // Leaving simple interest clears the rate along with it, which the line about the interest already says.
    const stillSimple = changes.interestTerms === undefined || changes.interestTerms === 'simple';
    if (stillSimple && changes.interestRate !== undefined && t.interestRate !== null && changes.interestRate !== t.interestRate) parts.push(`Rate changed from ${percent(t.interestRate)} to ${changes.interestRate === null ? 'none' : percent(changes.interestRate)}`);
    if (changes.principal !== undefined && t.principal !== null && changes.principal !== t.principal) parts.push(`Original amount changed from ${money(t.principal)} to ${changes.principal === null ? 'none' : money(changes.principal)}`);
    if (changes.startedAt !== undefined && t.startedAt !== null && changes.startedAt !== t.startedAt) parts.push(`Start date changed from ${shortDay(t.startedAt, now)} to ${changes.startedAt === null ? 'none' : shortDay(changes.startedAt, now)}`);
    if (changes.interestTerms !== undefined && t.interestTerms !== null && changes.interestTerms !== t.interestTerms) parts.push(`Interest changed from ${t.interestTerms} to ${changes.interestTerms ?? 'not set'}`);
    const text = parts.join('. ');
    return text ? text.slice(0, 140) : null;
  }

  async function submit() {
    if (problem || busy) return;
    if (nothing) { toast({ text: 'Nothing changed' }); onDone(); return; }
    if (repricing !== null && !awaiting) { setConfirmedKey(changesKey); return; }
    setBusy(true);
    try {
      try { await save(loan.id, changes); }
      catch (e) { toast({ text: eventErrorText(e) }); return; }
      const note = noteOf();
      if (note) {
        try { await writes.add({ subject: `liability:${loan.id}`, kind: 'note', occurredAt: Date.now(), note, apply: false }); }
        catch { toast({ text: 'Terms saved. The note about the change couldn’t be added to the history.' }); onDone(); return; }
      }
      toast({ text: 'Terms saved' });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
      <Txt v="cardTitle">{loan.name} · loan terms</Txt>
      {!coin && <Field label={`Original amount in ${loan.currency}`} numeric value={principal} onChangeText={setPrincipal} />}
      {!coin && <Field label="Started (like 2026-07-01 or Jul 2026)" value={started} onChangeText={setStarted} />}
      <Seg label="Repayment" options={[['none', 'Not set'], ['flexible', 'Flexible'], ['fixed', 'Fixed date']]} value={dueKind} onChange={setDueKind} />
      {dueKind === 'fixed' && <Field label="Repay by (like 2026-12-20)" value={due} onChangeText={setDue} />}
      <Seg label="Interest" options={coin || noSimple ? [['unset', 'Not set'], ['none', 'None'], ['manual', 'Manual']] : [['unset', 'Not set'], ['none', 'None'], ['simple', 'Simple'], ['manual', 'Manual']]} value={interest} onChange={setInterest} />
      {interest === 'simple' && <Field label="Yearly rate in percent" numeric value={rate} onChangeText={setRate} />}
      {interest === 'simple' && <Field label="Interest due on day (1 to 28, optional)" numeric value={dueDay} onChangeText={setDueDay} />}
      {interest === 'manual' && <Txt v="small" c="ink3">For compounding or fixed instalments. Numa keeps the label and calculates nothing.</Txt>}
      {interest === 'simple' && <Txt v="small" c="ink3">Each completed month adds the yearly rate ÷ 12 on what was owed at its start. The due day only says when to pay; it changes no figure. Check it against your agreement.</Txt>}
      {noSimple && !coin && <Txt v="small" c="ink3">Mortgages and cards usually charge compound or instalment interest, so Numa keeps their interest manual.</Txt>}
      {coin && <Txt v="small" c="ink3">This debt is owed in a coin, so Numa doesn’t keep an original amount or work out interest for it.</Txt>}
      {problem && <Txt v="small" c="warn" accessibilityRole="alert">{problem}</Txt>}
      {awaiting && <Txt v="small" c="warn" accessibilityRole="alert">{repricing}</Txt>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        <Pressable onPress={submit} disabled={!!problem || busy} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: !problem && !busy ? c.ink : c.s2, justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c={!problem ? 'bg' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>{awaiting ? 'Confirm change' : 'Save terms'}</Txt>}
        </Pressable>
        {awaiting && <Pressable onPress={() => setConfirmedKey(null)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" c="ink2">Keep editing</Txt></Pressable>}
        <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" c="ink2">Cancel</Txt></Pressable>
      </View>
    </View>
  );
}
