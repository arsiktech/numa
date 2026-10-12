import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { parseDate } from '@/ask/parse';
import type { CloudAsset, CloudHolding, CloudLiability } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { assetFields, debtFields, deletePlan, editPlan, fieldProblems, holdingFields, type AssetFields, type DebtFields, type Fields, type HoldingFields } from '@/data/editPlan';
import { convertCents } from '@/data/fx';
import { groupNames, type Item, type ItemType } from '@/data/items';
import { useCloudItems, useDemoItems, type ItemsSource } from '@/data/useItems';
import { useWriter } from '@/data/writes';
import { shortDay } from '@/domain/freshness';
import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { Field, Seg, toCents } from '@/ui/form';
import { toneColor } from '@/ui/ItemRow';
import { CurrencyScope, useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { WalletDetail } from '@/wallets/WalletDetail';

export default function ItemScreen() {
  const { type, id } = useLocalSearchParams<{ type: ItemType; id: string }>();
  return useSession().kind === 'signedIn' ? <Cloud type={type} id={id} /> : <Demo type={type} id={id} />;
}
function Cloud({ type, id }: { type: ItemType; id: string }) { return <Detail source={useCloudItems()} type={type} id={id} editable />; }
function Demo({ type, id }: { type: ItemType; id: string }) { return <Detail source={useDemoItems()} type={type} id={id} editable={false} />; }

function Detail({ source, type, id, editable }: { source: ItemsSource; type: ItemType; id: string; editable: boolean }) {
  if (source.status !== 'ready') return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View></Screen>;
  const item = source.items.find((i) => i.id === id && i.type === type);
  if (!item) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>This isn’t here anymore. It may have been deleted.</Txt></Screen>;
  return (
    <CurrencyScope currency={source.currency}>
      <Screen>{item.type === 'wallet' ? <WalletDetail item={item} now={source.now} editable={editable} /> : editable ? <Editable item={item as EditableItem} now={source.now} /> : <View><Facts item={item} now={source.now} /><Txt v="body" c="ink2" style={{ marginTop: 24 }}>This is demo data, so it can’t be changed. Sign in to track your own.</Txt></View>}</Screen>
    </CurrencyScope>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line, gap: 12 }}>
      <Txt v="body" c="ink2">{label}</Txt>
      <Txt v="figureSm" style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{value}</Txt>
    </View>
  );
}

function Facts({ item, gainCents, now }: { item: Item; gainCents?: number | null; now: number }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  const m = (cents: number, cur: Currency) => mask(formatMoney(cents, cur, { cents: true }));
  const raw = item.raw;
  return (
    <View>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>{groupNames[item.group].toUpperCase()}</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>{item.name}</Txt>
      <Txt v="figure" style={{ marginTop: 10, fontSize: 34, lineHeight: 40, color: item.group === 'debts' ? c.down : c.ink }}>{item.valueCents === null ? '—' : money(item.valueCents, { cents: true })}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c[toneColor[item.freshness.tone]] }} />
        <Txt v="body" c="ink2">{item.freshness.text}</Txt>
      </View>
      <View style={{ marginTop: 18 }}>
        {item.type === 'holding' && (() => {
          const h = raw as CloudHolding;
          return (
            <>
              <Fact label="Units" value={`${mask(String(h.quantity))} ${h.symbol}`} />
              {h.quoteProvider && h.quoteProvider !== 'mock' && <Fact label="Price" value={m(Math.round(h.marketPrice * 100), 'USD')} />}
              <Fact label="You paid" value={m(Math.round(h.costBasis * 100), h.currency)} />
              {gainCents != null && <Fact label="Gain" value={(gainCents >= 0 ? '+' : '−') + money(Math.abs(gainCents), { cents: true }).replace('−', '')} />}
            </>
          );
        })()}
        {item.type === 'asset' && <Fact label="Kind" value={item.detail ?? ''} />}
        {item.type === 'asset' && <Fact label="Updated" value={shortDay((raw as CloudAsset).updatedAt, now)} />}
        {item.type === 'liability' && <Fact label="Kind" value={item.detail ?? ''} />}
        {item.type === 'liability' && <Fact label="Due" value={(raw as CloudLiability).dueDate ? shortDay((raw as CloudLiability).dueDate!, now) : 'No due date'} />}
        {'currency' in raw && <Fact label="Currency" value={raw.currency} />}
      </View>
    </View>
  );
}

type EditableItem = Item & { type: Exclude<ItemType, 'wallet'> };
const fieldsOf = (item: Item): Fields => (item.type === 'asset' ? assetFields(item.raw as CloudAsset) : item.type === 'liability' ? debtFields(item.raw as CloudLiability) : holdingFields(item.raw as CloudHolding));
const noun = (t: ItemType) => (t === 'holding' ? 'holding' : t === 'liability' ? 'debt' : 'account');

function Editable({ item, now }: { item: EditableItem; now: number }) {
  const { c } = useTheme();
  const cloud = useCloudData();
  const run = useWriter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Fields>(() => fieldsOf(item));
  const [text, setText] = useState(() => initialText(item, fieldsOf(item)));
  if (cloud.status !== 'ready') return null;
  const { portfolioId, fx, data } = cloud;
  const acquiredAt = item.type === 'holding' ? (item.raw as CloudHolding).acquiredAt : undefined;
  const h = item.type === 'holding' ? (item.raw as CloudHolding) : null;
  const cost = h ? convertCents(Math.round(h.costBasis * 100), h.currency, data.currency, fx) : null;
  const gainCents = h && item.valueCents !== null && cost !== null && item.freshness.tone !== 'missing' ? item.valueCents - cost : null;
  const problems = fieldProblems(item.type, form);
  const dueText = item.type === 'liability' ? (text.due.trim() ? parseDate(text.due, new Date(now), 'future') : null) : null;
  const dueBad = item.type === 'liability' && text.due.trim() !== '' && !dueText;

  async function save() {
    setBusy(true); setError(null);
    try {
      const after = item.type === 'liability' ? { ...(form as DebtFields), dueDate: dueText?.at ?? null } : form;
      const p = editPlan(item.type, item.id, fieldsOf(item), after, portfolioId, acquiredAt);
      await run(p.apply);
      setEditing(false);
      toast({ text: `${item.name} saved`, action: { label: 'Undo', onPress: async () => { try { await run(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch (e) {
      setError(e instanceof Error && /currency|cash account/i.test(e.message) ? 'This account’s currency can’t change while it has transactions.' : 'Couldn’t save. Check the details and try again.');
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const p = deletePlan(item.type, item.id, fieldsOf(item), portfolioId, acquiredAt);
      await run(p.apply);
      router.back();
      toast({ text: `${item.name} deleted`, action: { label: 'Undo', onPress: async () => { try { await run(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch {
      setBusy(false);
      setConfirming(false);
      setError(item.type === 'asset' ? 'This account has transactions, so it can’t be deleted yet.' : 'Couldn’t delete. Try again.');
    }
  }

  const set = (patch: Record<string, unknown>) => setForm((f) => ({ ...f, ...patch }) as Fields);
  return (
    <View>
      <Facts item={item} gainCents={gainCents} now={now} />
      {editing && (
        <View style={{ marginTop: 22, gap: 12 }}>
          {item.type === 'holding' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Field label="Ticker" value={(form as HoldingFields).symbol} onChangeText={(t) => set({ symbol: t.toUpperCase() })} />
                <Field label="Name" value={(form as HoldingFields).name} onChangeText={(t) => set({ name: t })} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Field label="Units" numeric value={text.qty} onChangeText={(t) => { setText((x) => ({ ...x, qty: t })); const n = Number(t.replace(',', '.')); set({ quantity: Number.isFinite(n) ? n : 0 }); }} />
                <Field label="You paid in total" numeric value={text.amount} onChangeText={(t) => { setText((x) => ({ ...x, amount: t })); set({ costBasisCents: toCents(t) ?? 0 }); }} />
              </View>
              <Seg label="Kind" options={[['stock', 'Stock'], ['etf', 'Fund'], ['crypto', 'Crypto']]} value={(form as HoldingFields).kind === 'index' ? 'etf' : (form as HoldingFields).kind} onChange={(k) => set({ kind: k })} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <Field label="Name" value={(form as AssetFields).name} onChangeText={(t) => set({ name: t })} />
                <Field label={item.type === 'liability' ? 'You owe' : 'Value'} numeric value={text.amount} onChangeText={(t) => { setText((x) => ({ ...x, amount: t })); set({ balanceCents: toCents(t) ?? -1 }); }} />
              </View>
              {item.type === 'asset'
                ? <Seg label="Kind" options={[['cash', 'Cash'], ['real_estate', 'Property'], ['vehicle', 'Vehicle'], ['collectible', 'Collectible'], ['other', 'Other']]} value={(form as AssetFields).kind} onChange={(k) => set({ kind: k })} />
                : <Seg label="Kind" options={[['credit_card', 'Card'], ['loan', 'Loan'], ['mortgage', 'Mortgage'], ['other', 'Other']]} value={(form as DebtFields).kind} onChange={(k) => set({ kind: k })} />}
              {item.type === 'liability' && (
                <View style={{ gap: 4 }}>
                  <Field label="Due date (like 20 Oct, or leave empty)" value={text.due} onChangeText={(t) => setText((x) => ({ ...x, due: t }))} />
                  <Txt v="small" c={dueBad ? 'warn' : 'ink3'}>{dueBad ? 'That doesn’t look like a date.' : dueText ? `Due ${shortDay(dueText.at, now)}` : 'No due date'}</Txt>
                </View>
              )}
            </>
          )}
          <Seg label="Currency" options={[['EUR', '€ EUR'], ['USD', '$ USD']]} value={form.currency} onChange={(v) => set({ currency: v })} />
          {problems.length > 0 && <Txt v="small" c="warn">{problems[0]}</Txt>}
        </View>
      )}
      {error && <Txt v="body" style={{ color: c.down, marginTop: 14 }} accessibilityRole="alert">{error}</Txt>}

      {confirming ? (
        <View style={{ marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 10 }}>
          <Txt v="cardTitle">Delete this {noun(item.type)}?</Txt>
          <Txt v="body" c="ink2">It leaves your totals now. You can undo for a few seconds.</Txt>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={remove} disabled={busy} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.down, justifyContent: 'center' }}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Txt v="body" style={{ color: '#FFFFFF', fontFamily: 'Manrope_700Bold' }}>Delete</Txt>}
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {editing ? (
            <>
              <Pressable onPress={save} disabled={busy || problems.length > 0 || dueBad} accessibilityRole="button" aria-disabled={busy || problems.length > 0 || dueBad} style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: problems.length || dueBad ? 0.4 : 1 }}>
                {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Save</Txt>}
              </Pressable>
              <Pressable onPress={() => { setEditing(false); setForm(fieldsOf(item)); setText(initialText(item, fieldsOf(item))); setError(null); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => { setForm(fieldsOf(item)); setText(initialText(item, fieldsOf(item))); setEditing(true); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center' }}>
                <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Edit</Txt>
              </Pressable>
              <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Delete</Txt>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function initialText(item: Item, f: Fields) {
  const due = item.type === 'liability' && (f as DebtFields).dueDate ? shortDay((f as DebtFields).dueDate!, 0).replace(/^(\d+ \w+)$/, '$1') : '';
  if (item.type === 'holding') return { amount: ((f as HoldingFields).costBasisCents / 100).toFixed(2), qty: String((f as HoldingFields).quantity), due };
  return { amount: ((f as AssetFields).balanceCents / 100).toFixed(2), qty: '', due };
}
