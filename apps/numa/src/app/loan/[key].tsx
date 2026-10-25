import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { movesFrom, safetyOf, sharedWith, type Loan, type LoanPlace, type LoanRole } from '@/data/loans';
import { ago } from '@/domain/freshness';
import { SafetyGauge } from '@/loans/Safety';
import { linkErrorText, useLinkWrites, useLoans, type LoansState } from '@/loans/useLoans';
import { useTheme } from '@/theme/theme';
import { Field } from '@/ui/form';
import { CurrencyScope, useMoney } from '@/ui/money';
import { quantityText } from '@/ui/PositionRow';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/** One loan whole: what backs it, what is owed, where the money went and whether that paid off. */
export default function LoanScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to see your loans.</Txt></Screen>;
  return <Cloud loanKey={key} />;
}

function Cloud({ loanKey }: { loanKey: string }) {
  const state = useLoans();
  const cloud = useCloudData();
  if (state.status !== 'ready' || cloud.status !== 'ready') return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View></Screen>;
  const loan = state.loans.find((l) => l.key === loanKey);
  if (!loan) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>This loan isn’t here anymore. It may have been repaid or deleted.</Txt></Screen>;
  return <CurrencyScope currency={cloud.data.currency}><Detail loan={loan} state={state} /></CurrencyScope>;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const open = (p: LoanPlace) => p.open && router.push({ pathname: '/item/[type]/[id]', params: { type: p.open.type, id: p.open.id } });

function PlaceRow({ place, onRemove, last }: { place: LoanPlace; onRemove?: () => void; last: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  return (
    <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Pressable onPress={() => open(place)} disabled={!place.open} accessibilityRole={place.open ? 'link' : undefined}
        accessibilityLabel={`${place.name}, ${place.valueCents === null ? 'no value' : money(place.valueCents)}`}
        style={{ flex: 1, minWidth: 0, minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt v="body" c={place.gone ? 'warn' : 'ink'} style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{place.name}</Txt>
          {place.detail && <Txt v="small" c="ink2" numberOfLines={1}>{place.detail}</Txt>}
        </View>
        <Txt v="figure" style={{ fontSize: 15 }}>{place.valueCents === null ? '—' : money(place.valueCents)}</Txt>
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Unlink ${place.name}`} hitSlop={6}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="body" c="ink3" style={{ fontSize: 20 }}>×</Txt>
        </Pressable>
      )}
    </View>
  );
}

/** Places the money could have gone, biggest first, with a filter once the list is long. */
function Picker({ loan, role, state, onPick, onClose }: { loan: Loan; role: LoanRole; state: Extract<LoansState, { status: 'ready' }>; onPick: (key: string) => void; onClose: () => void }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const [q, setQ] = useState('');
  const here = new Set([...loan.deployed, ...loan.collateral].map((p) => p.key));
  const loanName = (key: string) => state.loans.find((l) => l.key === key)?.name ?? 'a closed loan';
  const all = [...state.places.values()].filter((p) => p.key !== loan.key && !here.has(p.key)).sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1));
  const words = q.trim().toLowerCase();
  const shown = words ? all.filter((p) => `${p.name} ${p.detail ?? ''}`.toLowerCase().includes(words)) : all;
  return (
    <View style={{ marginTop: 10, padding: 14, borderRadius: 18, backgroundColor: c.s1, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="cardTitle">{role === 'collateral' ? 'What backs this loan?' : 'Where did the money go?'}</Txt>
        <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Done</Txt></Pressable>
      </View>
      {all.length > 8 && <Field label="Find a wallet, coin or record" value={q} onChangeText={setQ} />}
      {shown.length === 0 && <Txt v="body" c="ink2">{all.length ? 'Nothing matches.' : 'Nothing else to link yet. Add the account, holding or wallet first.'}</Txt>}
      {shown.slice(0, 40).map((p) => {
        // Pledged places move between loans; where several loans' money went is shared.
        const other = movesFrom(state.links, loan.key, p.key, role)[0];
        const shared = other ? [] : role === 'deployed' ? sharedWith(state.links, loan.key, p.key) : [];
        const note = other ? `On ${loanName(other)} · tap to move it here` : shared.length ? `Also where ${shared.map(loanName).join(', ')} went` : p.detail;
        return (
          <Pressable key={p.key} onPress={() => onPick(p.key)} accessibilityRole="button" accessibilityLabel={`Link ${p.name}${other ? `, moves it from ${loanName(other)}` : shared.length ? `, shared with ${shared.map(loanName).join(', ')}` : ''}`}
            style={{ minHeight: 56, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{p.name}</Txt>
              <Txt v="small" c={other ? 'warn' : 'ink2'} numberOfLines={1}>{note}</Txt>
            </View>
            <Txt v="figureSm" style={{ fontSize: 14 }}>{p.valueCents === null ? '—' : money(p.valueCents)}</Txt>
            <Txt v="body" c="ink3">+</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function Detail({ loan, state }: { loan: Loan; state: Extract<LoansState, { status: 'ready' }> }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  const toast = useToast();
  const writes = useLinkWrites(state);
  const [picking, setPicking] = useState<LoanRole | null>(null);
  const [busy, setBusy] = useState(false);
  const owed = loan.owed.map((o) => quantityText(o.quantity, o.symbol) ?? o.symbol).join(' + ');
  const safety = safetyOf(loan);

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    try { await work(); toast({ text: done }); } catch (e) { toast({ text: linkErrorText(e) }); }
    setBusy(false);
  }
  const pick = (key: string) => { if (!picking) return; const role = picking; setPicking(null); void run(() => writes.add(loan.key, key, role), 'Linked'); };
  const unlink = (p: LoanPlace) => run(() => writes.remove(loan.key, p.key), `${p.name} unlinked`);

  return (
    <Screen>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>LOAN · {loan.where.toUpperCase()}</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>{loan.name}</Txt>
      <Txt v="figure" style={{ marginTop: 10, fontSize: 34, lineHeight: 40, color: c.down }}>{loan.debtCents === null ? '—' : money(loan.debtCents, { cents: true })}</Txt>
      {owed !== '' && <Txt v="body" c="ink2" style={{ marginTop: 4 }}>{mask(owed)} owed</Txt>}

      {/* How close the protocol is to selling what backs it. */}
      {safety && (
        <View style={{ marginTop: 20, paddingVertical: 20, borderRadius: 18, backgroundColor: c.s1 }}>
          <SafetyGauge safety={safety} />
          {loan.checkedAt !== null && <Txt v="small" c="ink3" style={{ textAlign: 'center', marginTop: 8 }}>Read from {loan.name.split(' · ')[0]} {ago(loan.checkedAt, state.now)}</Txt>}
        </View>
      )}

      {/* The answer first: has borrowing paid off so far? */}
      {loan.resultCents !== null && loan.deployedCents !== null && loan.debtCents !== null && (
        <View style={{ marginTop: 18, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 4 }} accessibilityRole="summary">
          <Txt v="figure" style={{ fontSize: 22, color: loan.resultCents >= 0 ? c.upInk : c.down }}>{money(loan.resultCents, { cents: true, sign: true })}</Txt>
          <Txt v="body" c="ink2">What the money went into is worth {money(loan.deployedCents, { cents: true })}; you owe {money(loan.debtCents, { cents: true })}. Your net worth already counts both.</Txt>
        </View>
      )}

      <View style={{ marginTop: 18 }}>
        {loan.ltv !== null ? (
          <Row label="Loan to value" value={`${pct(loan.ltv)}${loan.liquidationLtv !== null ? ` · sold at ${pct(loan.liquidationLtv)}` : ''}`} tone={loan.liquidationLtv !== null && loan.ltv >= loan.liquidationLtv * 0.85 ? 'down' : undefined} />
        ) : loan.kind === 'wallet' && loan.collateralCents ? <Row label="Loan to value" value="Needs a fresh check" /> : null}
        {loan.netCents !== null && (loan.collateral.length > 0 || loan.deployed.length > 0) && <Row label="Your stake in it" value={money(loan.netCents, { cents: true })} />}
        <Row label={loan.kind === 'wallet' ? 'Read from the protocol' : 'Source'} value={loan.checkedAt !== null ? ago(loan.checkedAt, state.now) : 'Your records, not the lender’s'} />
      </View>

      <Txt v="label" c="ink3" style={{ marginTop: 24 }} accessibilityRole="header">BACKED BY{loan.collateralCents !== null ? ` · ${money(loan.collateralCents)}` : ''}</Txt>
      {loan.collateral.map((p, i) => <PlaceRow key={p.key} place={p} last={i === loan.collateral.length - 1} onRemove={loan.kind === 'debt' && !busy ? () => unlink(p) : undefined} />)}
      {loan.kind === 'wallet' && !loan.collateral.length && <Txt v="body" c="ink2" style={{ marginTop: 8 }}>The protocol reports no collateral for this loan.</Txt>}
      {loan.kind === 'debt' && (picking === 'collateral' ? <Picker loan={loan} role="collateral" state={state} onPick={pick} onClose={() => setPicking(null)} />
        : <AddButton label={loan.collateral.length ? 'Add more' : 'Add what backs it, if anything'} onPress={() => setPicking('collateral')} disabled={busy} />)}

      <Txt v="label" c="ink3" style={{ marginTop: 24 }} accessibilityRole="header">WHERE THE MONEY WENT{loan.deployedCents !== null ? ` · ${money(loan.deployedCents)}` : ''}</Txt>
      {!loan.deployed.length && <Txt v="body" c="ink2" style={{ marginTop: 8 }}>Not set yet. Pick where the borrowed money went, and Numa shows whether borrowing has paid off. Nothing moves and your net worth stays the same. If it went into a company or property, it isn’t taken from what you could have within a week.</Txt>}
      {loan.deployed.map((p, i) => <PlaceRow key={p.key} place={p} last={i === loan.deployed.length - 1} onRemove={busy ? undefined : () => unlink(p)} />)}
      {loan.gaps > 0 && <Txt v="small" c="warn" style={{ marginTop: 6 }}>{loan.gaps} {loan.gaps === 1 ? 'place has' : 'places have'} no value now and {loan.gaps === 1 ? 'is' : 'are'} left out, so the result is unknown.</Txt>}
      {picking === 'deployed' ? <Picker loan={loan} role="deployed" state={state} onPick={pick} onClose={() => setPicking(null)} />
        : <AddButton label={loan.deployed.length ? 'Add another place' : 'Pick where it went'} onPress={() => setPicking('deployed')} disabled={busy} />}
    </Screen>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'down' }) {
  const { c } = useTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line, gap: 12 }}>
      <Txt v="body" c="ink2">{label}</Txt>
      <Txt v="figureSm" c={tone ?? 'ink'} style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{value}</Txt>
    </View>
  );
}

function AddButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ marginTop: 12, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}>
      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{label}</Txt>
    </Pressable>
  );
}
