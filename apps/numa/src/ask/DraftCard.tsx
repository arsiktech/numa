import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { IconCheck } from '@/ui/icons';
import { Field, Seg, toCents } from '@/ui/form';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';
import { draftProblems, type Draft } from './parse';

export type DraftStatus = 'draft' | 'saving' | 'saved' | 'undoing' | 'undone' | 'discarded';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (ms: number) => { const d = new Date(ms); return new Date().toDateString() === d.toDateString() ? 'Today' : `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; };
const assetKinds = { cash: 'Cash account', real_estate: 'Property', vehicle: 'Vehicle', collectible: 'Collectible', other: 'Other asset' } as const;

function headline(d: Draft): { label: string; cents: number | null; sign: '' | '+' | '−'; lines: string[] } {
  switch (d.type) {
    case 'transaction':
      return { label: d.kind === 'income' ? `Income${d.categoryName ? ' · ' + d.categoryName : ''}` : `Spending${d.categoryName ? ' · ' + d.categoryName : ''}`, cents: d.amountCents, sign: d.kind === 'income' ? '+' : '−', lines: [d.description, day(d.occurredAt)] };
    case 'asset':
      return { label: d.existing ? `Update ${d.existing.name}` : `New · ${assetKinds[d.assetKind]}`, cents: d.amountCents, sign: '', lines: [d.existing ? `Was ${formatMoney(d.existing.balanceCents, d.existing.currency, { cents: true })}` : d.name] };
    case 'debt':
      return { label: d.existing ? `Update ${d.existing.name}` : 'New debt', cents: d.amountCents, sign: '', lines: [d.existing ? `Was ${formatMoney(d.existing.balanceCents, d.existing.currency, { cents: true })}` : d.name, d.dueDate ? `Due ${day(d.dueDate)}` : 'No due date'] };
    case 'holding': {
      const total = d.priceCents === null ? null : Math.round(d.priceCents * d.quantity);
      const what = d.mode === 'add' ? `Buy ${d.quantity} ${d.symbol}` : `Holding ${d.quantity} ${d.symbol}`;
      const after = d.existing && d.mode === 'add' ? `You’ll have ${Math.round((d.existing.quantity + d.quantity) * 1e8) / 1e8} ${d.symbol}` : d.name;
      return { label: what, cents: total, sign: '', lines: [d.priceCents === null ? 'Price paid not given' : `${formatMoney(d.priceCents, d.currency, { cents: true })} each`, after] };
    }
  }
}

function Editor({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const amountOf = (d: Draft) => (d.type === 'holding' ? d.priceCents : d.amountCents);
  const [amount, setAmount] = useState(() => { const v = amountOf(draft); return v === null ? '' : (v / 100).toFixed(2); });
  const [qty, setQty] = useState(draft.type === 'holding' ? String(draft.quantity) : '');
  const setMoney = (text: string) => {
    setAmount(text);
    const cents = toCents(text);
    if (draft.type === 'holding') onChange({ ...draft, priceCents: cents });
    else onChange({ ...draft, amountCents: cents ?? 0 });
  };
  const currency = <Seg label="Currency" options={[['EUR', '€ EUR'], ['USD', '$ USD']] as [Currency, string][]} value={draft.currency} onChange={(v) => onChange({ ...draft, currency: v })} />;
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {draft.type === 'transaction' && <Seg label="Kind" options={[['expense', 'Spent'], ['income', 'Received']]} value={draft.kind} onChange={(k) => onChange({ ...draft, kind: k, categoryId: null, categoryName: null })} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {draft.type === 'transaction' && <Field label="What for" value={draft.description} onChangeText={(t) => onChange({ ...draft, description: t })} />}
        {(draft.type === 'asset' || draft.type === 'debt') && !draft.existing && <Field label="Name" value={draft.name} onChangeText={(t) => onChange({ ...draft, name: t })} />}
        {draft.type === 'holding' && <Field label={`How many ${draft.symbol}`} numeric value={qty} onChangeText={(t) => { setQty(t); const n = Number(t.replace(',', '.')); onChange({ ...draft, quantity: Number.isFinite(n) ? n : 0 }); }} />}
        <Field label={draft.type === 'holding' ? 'Price paid each' : 'Amount'} numeric value={amount} onChangeText={setMoney} />
      </View>
      {currency}
    </View>
  );
}

/** A draft Numa read from the person's words. Nothing is saved until they press Save, and Save has Undo. */
export function DraftCard({ draft, status, error, demo, onChange, onSave, onDiscard, onUndo }: {
  draft: Draft; status: DraftStatus; error: string | null; demo: boolean;
  onChange: (d: Draft) => void; onSave: () => void; onDiscard: () => void; onUndo: () => void;
}) {
  const { c } = useTheme();
  const { mask } = useMoney();
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const h = headline(draft);
  const problems = draftProblems(draft);
  const open = status === 'draft';
  const chip = { draft: 'DRAFT', saving: 'SAVING', saved: demo ? 'DEMO · NOT SAVED' : 'SAVED', undoing: 'UNDOING', undone: 'UNDONE', discarded: 'DISCARDED' }[status];
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.duration(500)} accessibilityLabel={`Draft. ${h.label}`} style={{ padding: 16, borderRadius: 20, backgroundColor: c.s1, borderWidth: 1, borderColor: open ? c.line2 : 'transparent', opacity: status === 'discarded' || status === 'undone' ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Txt v="cardTitle" style={{ flex: 1 }} numberOfLines={1}>{h.label}</Txt>
        <View style={{ minHeight: 22, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center', backgroundColor: status === 'saved' ? c.upBg : c.s2 }}>
          <Txt v="label" c={status === 'saved' ? 'upInk' : 'ink2'} style={{ fontSize: 10 }}>{chip}</Txt>
        </View>
      </View>
      <Txt v="figure" style={{ marginTop: 10, fontSize: 28, lineHeight: 34, color: draft.type === 'transaction' && draft.kind === 'income' ? c.upInk : c.ink }}>
        {h.cents === null ? '—' : mask(h.sign + formatMoney(h.cents, draft.currency, { cents: true }))}
      </Txt>
      {h.lines.map((l, i) => <Txt key={i} v="body" c="ink2" style={{ fontSize: 14, marginTop: 2 }}>{mask(l)}</Txt>)}
      {open && editing && <Editor draft={draft} onChange={onChange} />}
      {open && problems.length > 0 && <Txt v="small" style={{ color: c.warn, marginTop: 8 }}>{problems[0]}</Txt>}
      {error && <Txt v="small" style={{ color: c.down, marginTop: 8 }} accessibilityRole="alert">{error}</Txt>}

      {open && (
        <View style={{ marginTop: 14, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Pressable onPress={onSave} disabled={problems.length > 0} accessibilityRole="button" aria-disabled={problems.length > 0} style={{ minHeight: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: problems.length ? 0.4 : 1 }}>
            <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>Save</Txt>
          </Pressable>
          <Pressable onPress={() => setEditing((e) => !e)} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{editing ? 'Done' : 'Edit'}</Txt>
          </Pressable>
          <Pressable onPress={onDiscard} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>Discard</Txt>
          </Pressable>
        </View>
      )}
      {(status === 'saving' || status === 'undoing') && <ActivityIndicator style={{ marginTop: 14, alignSelf: 'flex-start' }} color={c.ink} />}
      {status === 'saved' && (
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconCheck color={c.upInk} />
          <Txt v="body" c="upInk" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{demo ? 'Demo only, nothing saved' : 'Saved'}</Txt>
          {!demo && (
            <Pressable onPress={onUndo} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 6, minHeight: 32, justifyContent: 'center' }}>
              <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>Undo</Txt>
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}
