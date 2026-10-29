import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { parseDate } from '@/ask/parse';
import type { CloudAsset, CloudHolding, CloudLiability } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { assetFields, debtFields, deletePlan, editPlan, fieldProblems, holdingFields, monthYear, parseBought, type AssetFields, type DebtFields, type Fields, type HoldingFields } from '@/data/editPlan';
import { groupNames, type Item, type ItemType } from '@/data/items';
import { useCloudItems, useDemoItems, type ItemsSource } from '@/data/useItems';
import { useWriter } from '@/data/writes';
import { useNavigationWriter } from '@/data/NavigationWriter';
import { shortDay } from '@/domain/freshness';
import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { openLoan } from '@/loans/LoansSection';
import { PortalSource } from '@/loans/PortalSource';
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

function Facts({ item, now }: { item: Item; now: number }) {
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
            </>
          );
        })()}
        {item.type === 'asset' && (raw as CloudAsset).costBasis ? <Fact label="You paid" value={m(Math.round((raw as CloudAsset).costBasis! * 100), (raw as CloudAsset).currency)} /> : null}
        {item.type === 'asset' && (raw as CloudAsset).acquiredAt && !item.gain ? <Fact label="Bought" value={monthYear((raw as CloudAsset).acquiredAt!)} /> : null}
        {item.gain && <GainFact gain={item.gain} />}
        {item.type === 'asset' && <Fact label="Kind" value={item.detail ?? ''} />}
        {item.type === 'asset' && <Fact label="Updated" value={shortDay((raw as CloudAsset).updatedAt, now)} />}
        {item.type === 'liability' && <Fact label="Kind" value={item.detail ?? ''} />}
        {item.type === 'liability' && (raw as CloudLiability).owedSymbol && (
          <Fact label="Owed in" value={`${mask(String((raw as CloudLiability).owedQuantity))} ${(raw as CloudLiability).owedSymbol}${(raw as CloudLiability).owedPriceAt ? '' : ' · no price yet'}`} />
        )}
        {item.type === 'liability' && <Fact label="Due" value={(raw as CloudLiability).dueDate ? shortDay((raw as CloudLiability).dueDate!, now) : 'No due date'} />}
        {(item.type === 'holding' || item.type === 'asset') && <Fact label="Where it is" value={(raw as CloudHolding | CloudAsset).location || 'Not set'} />}
        {'currency' in raw && <Fact label="Currency" value={raw.currency} />}
      </View>
    </View>
  );
}

/** What it gained or lost since it was bought, in money and percent, coloured by direction. */
function GainFact({ gain }: { gain: NonNullable<Item['gain']> }) {
  const { c } = useTheme();
  const { money, hidden } = useMoney();
  const up = gain.cents >= 0;
  const pct = `${up ? '+' : '−'}${Math.abs(gain.pct * 100).toFixed(1)}%`;
  const label = gain.since ? `Since ${monthYear(gain.since)}` : 'Since bought';
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line, gap: 12 }}>
      <Txt v="body" c="ink2">{label}</Txt>
      <Txt v="figureSm" style={{ fontSize: 14, color: up ? c.upInk : c.down }} accessibilityLabel={`${up ? 'Up' : 'Down'} ${hidden ? '' : money(Math.abs(gain.cents), { cents: true })} ${pct.replace('−', 'minus ')}`}>
        {(up ? '+' : '−') + money(Math.abs(gain.cents), { cents: true }).replace('−', '')} · {pct}
      </Txt>
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
  const navigationWrite = useNavigationWriter();
  const navigation = useNavigation();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Fields>(() => fieldsOf(item));
  const [text, setText] = useState(() => initialText(item, fieldsOf(item)));
  if (cloud.status !== 'ready') return null;
  const { portfolioId } = cloud;
  const acquiredAt = item.type === 'holding' ? (item.raw as CloudHolding).acquiredAt : undefined;
  const problems = fieldProblems(item.type, form);
  const dueText = item.type === 'liability' ? (text.due.trim() ? parseDate(text.due, new Date(now), 'future') : null) : null;
  const dueBad = item.type === 'liability' && text.due.trim() !== '' && !dueText;
  const boughtAt = item.type === 'asset' && text.bought.trim() ? parseBought(text.bought, now) : null;
  const boughtBad = item.type === 'asset' && text.bought.trim() !== '' && boughtAt === null;

  async function save() {
    setBusy(true); setError(null);
    try {
      const after = item.type === 'liability' ? { ...(form as DebtFields), dueDate: dueText?.at ?? null } : item.type === 'asset' ? { ...(form as AssetFields), acquiredAt: boughtAt } : form;
      const p = editPlan(item.type, item.id, fieldsOf(item), after, portfolioId, acquiredAt);
      await run(p.apply);
      setEditing(false);
      toast({ text: `${item.name} saved`, action: { label: 'Undo', onPress: async () => { try { await navigationWrite(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch (e) {
      setError(e instanceof Error && /currency|cash account/i.test(e.message) ? 'This account’s currency can’t change while it has transactions.' : 'Couldn’t save. Check the details and try again.');
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const p = deletePlan(item.type, item.id, fieldsOf(item), portfolioId, acquiredAt);
      await navigationWrite(p.apply);
      if (navigation.isFocused()) router.back();
      toast({ text: `${item.name} deleted`, action: { label: 'Undo', onPress: async () => { try { await navigationWrite(p.undo); } catch { toast({ text: 'Couldn’t undo that.' }); } } } });
    } catch {
      setBusy(false);
      setConfirming(false);
      setError(item.type === 'asset' ? 'This account has transactions, so it can’t be deleted yet.' : 'Couldn’t delete. Try again.');
    }
  }

  const set = (patch: Record<string, unknown>) => setForm((f) => ({ ...f, ...patch }) as Fields);
  return (
    <View>
      <Facts item={item} now={now} />
      {item.type === 'liability' && (
        <Pressable onPress={() => openLoan(`liability:${item.id}`)} accessibilityRole="link" style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>What backs it and where the money went</Txt>
          <Txt v="body" c="ink3">›</Txt>
        </Pressable>
      )}
      {item.type === 'liability' && !(item.raw as CloudLiability).owedSymbol && <PortalSource portfolioId={portfolioId} liabilityId={item.id} now={now} />}
      {item.type === 'asset' && <PortalSource portfolioId={portfolioId} assetId={item.id} now={now} />}
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
                ? <Seg label="Kind" options={[['cash', 'Cash'], ['real_estate', 'Property'], ['vehicle', 'Vehicle'], ['collectible', 'Collectible'], ['business', 'Business'], ['other', 'Other']]} value={(form as AssetFields).kind} onChange={(k) => set({ kind: k })} />
                : <Seg label="Kind" options={[['credit_card', 'Card'], ['loan', 'Loan'], ['mortgage', 'Mortgage'], ['other', 'Other']]} value={(form as DebtFields).kind} onChange={(k) => set({ kind: k })} />}
              {item.type === 'asset' && (form as AssetFields).kind !== 'cash' && (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Field label="You paid in total" numeric value={text.cost} onChangeText={(t) => { setText((x) => ({ ...x, cost: t })); set({ costCents: t.trim() ? toCents(t) ?? -1 : null }); }} />
                    <Field label="Bought (like Feb 2025)" value={text.bought} onChangeText={(t) => setText((x) => ({ ...x, bought: t }))} />
                  </View>
                  <Txt v="small" c={boughtBad ? 'warn' : 'ink3'}>{boughtBad ? 'That doesn’t look like a past date.' : 'Leave empty if you don’t know. Numa then shows no gain.'}</Txt>
                </View>
              )}
              {item.type === 'liability' && (
                <View style={{ gap: 4 }}>
                  <Field label="Due date (like 20 Oct, or leave empty)" value={text.due} onChangeText={(t) => setText((x) => ({ ...x, due: t }))} />
                  <Txt v="small" c={dueBad ? 'warn' : 'ink3'}>{dueBad ? 'That doesn’t look like a date.' : dueText ? `Due ${shortDay(dueText.at, now)}` : 'No due date'}</Txt>
                  <View style={{ marginTop: 8 }}><Field label="Owed to (like Stas or a bank)" value={(form as DebtFields).counterparty} onChangeText={(t) => set({ counterparty: t })}  /></View>
                </View>
              )}
            </>
          )}
          {item.type !== 'liability' && <Field label={item.type === 'holding' ? 'Where it is (like Trade Republic or Ledger)' : 'Where it is (like a bank or a safe)'} value={(form as AssetFields | HoldingFields).location} onChangeText={(t) => set({ location: t })} />}
          {item.type === 'asset' && <Field label="Owed to you by (if you lent this money)" value={(form as AssetFields).owedBy} onChangeText={(t) => set({ owedBy: t })} />}
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
              <Pressable onPress={save} disabled={busy || problems.length > 0 || dueBad || boughtBad} accessibilityRole="button" aria-disabled={busy || problems.length > 0 || dueBad || boughtBad} style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: problems.length || dueBad || boughtBad ? 0.4 : 1 }}>
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
  if (item.type === 'holding') return { amount: ((f as HoldingFields).costBasisCents / 100).toFixed(2), qty: String((f as HoldingFields).quantity), due, cost: '', bought: '' };
  const a = f as AssetFields;
  return { amount: (a.balanceCents / 100).toFixed(2), qty: '', due, cost: a.costCents ? (a.costCents / 100).toFixed(2) : '', bought: a.acquiredAt ? new Date(a.acquiredAt).toISOString().slice(0, 10) : '' };
}
