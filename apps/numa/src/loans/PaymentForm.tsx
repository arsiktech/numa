import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { DebtEvent, Party } from '@/data/moneyMap';
import { accrual, interestAddable, interestAddProblem, parseAmount, roundDecimals, splitProblem } from '@/domain/loanTerms';
import { useTheme } from '@/theme/theme';
import { Field, Seg } from '@/ui/form';
import { amountText } from '@/ui/PositionRow';
import { Txt } from '@/ui/Txt';
import { calendarToday, inCurrency, pastDate, termEventOf, termsOf } from './termsHelpers';
import { useRequestId } from './useRequestId';

export const unitText = (amount: number, unit: string) => (unit === 'EUR' ? `€${amountText(amount)}` : unit === 'USD' ? `$${amountText(amount)}` : `${amountText(amount)} ${unit}`);

export type NewEvent = {
  subject: string; kind: DebtEvent['kind']; amount?: number; unit?: string; principalPart?: number; interestPart?: number; feePart?: number;
  occurredAt: number; note?: string; apply: boolean;
  /** One id for one intended save: a second tap with the same inputs sends the same id and counts once. */
  clientMutationId: string;
};

const WITHIN_HALF_A_CENT = 0.005;

/** A payment, more borrowed or lent, interest added to the loan, or a note, on one of this party's debts. */
export function PaymentForm({ party, events, now, onSave, onCancel }: { party: Party; events: DebtEvent[]; now: number; onSave: (e: NewEvent) => Promise<unknown> | void; onCancel: () => void }) {
  const { c } = useTheme();
  const records = party.records.filter((r) => r.unit);
  const byYou = party.owed === 'byYou';
  const [subject, setSubject] = useState(records[0]?.subject ?? '');
  const [kindChoice, setKindChoice] = useState<DebtEvent['kind']>(byYou ? 'repaid' : 'received');
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState('today');
  const [note, setNote] = useState('');
  const [apply, setApply] = useState(true);
  const [split, setSplit] = useState(false);
  const [interestText, setInterestText] = useState('');
  const [feesText, setFeesText] = useState('');
  const [principalText, setPrincipalText] = useState('');
  const [busy, setBusy] = useState(false);
  // A synchronous guard: two taps in the same moment both see "not busy" in state, but not in this ref.
  const inFlight = useRef(false);
  const record = records.find((r) => r.subject === subject);
  const unit = record?.unit ?? '';
  const isCoin = !!unit && unit !== 'EUR' && unit !== 'USD';

  // Interest worked out from this debt's terms. It is only offered to be added to the loan when the
  // history and the saved balance agree, because otherwise the figure cannot be trusted.
  const today = calendarToday(now);
  const loanTerms = record?.loan && inCurrency(record.loan) ? termsOf(record.loan) : null;
  const history = record ? events.filter((e) => e.subject === record.subject).map(termEventOf) : [];
  const interest = loanTerms && record?.loan ? accrual(loanTerms, history, record.loan.balance, today) : null;
  const interestOwed = interest?.status === 'ok' && interest.reconciles && interest.owed > WITHIN_HALF_A_CENT ? interest.owed : null;
  const disagrees = interest?.status === 'ok' && !interest.reconciles;

  const kinds: [DebtEvent['kind'], string][] = byYou
    ? [['repaid', 'Paid back'], ['borrowed', 'Borrowed more'], ...(interestOwed !== null ? [['capitalized', 'Interest added'] as [DebtEvent['kind'], string]] : []), ['note', 'Note']]
    : [['received', 'Got back'], ['lent', 'Lent more'], ['note', 'Note']];
  // A kind that stops being offered (another debt picked, or its interest settled) falls back to the first.
  const kind = kinds.some(([k]) => k === kindChoice) ? kindChoice : kinds[0][0];

  // Kept to cents, or eight decimals for a coin, rounded half up as the server rounds, so what is checked here is what is saved.
  const typed = parseAmount(amount);
  const qty = Number.isFinite(typed) ? roundDecimals(typed, isCoin ? 8 : 2) : typed;
  const at = pastDate(when, now);
  const isNote = kind === 'note';
  const canSplit = (kind === 'repaid' || kind === 'received') && !!unit;
  const splitOn = split && canSplit;
  const interestPart = interestText.trim() === '' ? 0 : parseAmount(interestText);
  const feePart = feesText.trim() === '' ? 0 : parseAmount(feesText);
  const rest = Math.round((qty - interestPart - feePart) * 1e8) / 1e8;
  const principalPart = principalText.trim() === '' ? rest : parseAmount(principalText);
  const splitIssue = splitOn && Number.isFinite(qty) && qty > 0 ? splitProblem(qty, { principal: principalPart, interest: interestPart, fees: feePart }, isCoin ? 8 : 2) : null;
  const partsReadable = !splitOn || [principalPart, interestPart, feePart].every(Number.isFinite);
  // Interest added on an earlier date is checked against what was owed on that date, and against
  // what is still owed today once it is added, the way the server checks it.
  const adding = kind === 'capitalized' && interestOwed !== null && loanTerms !== null && at !== null;
  const dated = at !== null && at !== today;
  const addable = adding ? interestAddable(loanTerms!, history, at!, today) : null;
  const addIssue = adding && Number.isFinite(qty) && qty > 0 ? interestAddProblem(loanTerms!, history, qty, at!, today) : null;
  const tooMuchInterest = addIssue !== null;
  const addIssueText = addIssue !== null && addable !== null && qty > addable + WITHIN_HALF_A_CENT
    ? `That is more than the interest ${dated ? 'that can be added on that date' : 'owed so far'}, ${unitText(addable, unit)}.`
    : addIssue;
  const ok = !!record && at !== null && (isNote ? note.trim() !== '' : Number.isFinite(qty) && qty > 0) && !splitIssue && partsReadable && !tooMuchInterest;

  // The same inputs keep the same id, so a second tap counts once; changing anything starts a new one.
  const requestId = useRequestId(JSON.stringify([subject, kind, amount, when, note, apply, splitOn, interestText, feesText, principalText]), 'numa.debtEvent');

  async function submit() {
    if (!ok || at === null || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await onSave({
        subject, kind, occurredAt: at, apply: !isNote && apply,
        ...(isNote ? {} : { amount: qty, unit }),
        ...(splitOn ? { principalPart, interestPart, feePart } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        clientMutationId: requestId,
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const amountLabel = kind === 'capitalized' ? `Interest to add in ${unit}` : `${splitOn ? 'Total payment' : 'Amount'} in ${unit}`;
  return (
    <View style={{ marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
      <Txt v="cardTitle">{byYou ? 'Record a payment' : 'Record money back'}</Txt>
      {records.length > 1 && <Seg label="Which debt" options={records.map((r) => [r.subject, r.amount] as [string, string])} value={subject} onChange={setSubject} />}
      <Seg label="What happened" options={kinds} value={kind} onChange={setKindChoice} />
      {disagrees && byYou && <Txt v="small" c="warn">The history and the balance of this debt disagree, so interest can’t be added to it yet. Add the missing payments to the history first.</Txt>}
      {kind === 'capitalized' && <Txt v="small" c="ink3">Unpaid interest becomes part of the amount owed, and counts as interest settled. {dated ? 'Interest that can be added on that date' : 'Interest owed so far'}: {addable === null ? '—' : unitText(addable, unit)}.</Txt>}
      {!isNote && <Field label={amountLabel} numeric value={amount} onChangeText={setAmount} />}
      {kind === 'capitalized' && addable !== null && addable > WITHIN_HALF_A_CENT && amount.trim() === '' && (
        <Pressable onPress={() => setAmount(String(addable))} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Use {unitText(addable, unit)}</Txt>
        </Pressable>
      )}
      {addIssueText !== null && <Txt v="small" c="warn" accessibilityRole="alert">{addIssueText}</Txt>}
      {canSplit && (
        <Pressable onPress={() => setSplit((x) => !x)} accessibilityRole="switch" aria-checked={split} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: split ? c.ink : c.ink3, backgroundColor: split ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {split && <Txt v="small" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>✓</Txt>}
          </View>
          <Txt v="body" style={{ flex: 1 }}>Split into principal, interest and fees</Txt>
        </Pressable>
      )}
      {splitOn && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Interest" numeric value={interestText} onChangeText={setInterestText} />
            <Field label="Fees" numeric value={feesText} onChangeText={setFeesText} />
          </View>
          <Field label={`Principal (empty: the rest, ${Number.isFinite(principalPart) ? unitText(Math.max(0, principalPart), unit) : '—'})`} numeric value={principalText} onChangeText={setPrincipalText} />
          {splitIssue ? <Txt v="small" c="warn" accessibilityRole="alert">{splitIssue}</Txt> : <Txt v="small" c="ink3">Only the principal lowers what you owe. Interest and fees are kept in the history.</Txt>}
        </View>
      )}
      <Field label="When (like today or 20 Sep)" value={when} onChangeText={setWhen} />
      {at === null && when.trim() !== '' && <Txt v="small" c="warn">That doesn’t look like a past date.</Txt>}
      <Field label={isNote ? 'Note' : 'Note (optional, like Paid to Liza via Zen)'} value={note} onChangeText={setNote} />
      {!isNote && (
        <Pressable onPress={() => setApply((a) => !a)} accessibilityRole="switch" aria-checked={apply} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: apply ? c.ink : c.ink3, backgroundColor: apply ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {apply && <Txt v="small" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>✓</Txt>}
          </View>
          <Txt v="body" style={{ flex: 1 }}>{byYou ? 'Change what I owe' : 'Change what I’m owed'}</Txt>
        </Pressable>
      )}
      {!isNote && !apply && <Txt v="small" c="ink3">History only: the amount owed stays as it is, for a payment already counted.</Txt>}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable onPress={submit} disabled={!ok || busy} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: ok && !busy ? c.ink : c.s2, justifyContent: 'center' }}>
          <Txt v="body" c={ok && !busy ? 'bg' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>Save</Txt>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}><Txt v="body" c="ink2">Cancel</Txt></Pressable>
      </View>
    </View>
  );
}
