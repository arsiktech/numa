import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { safetyOf, type Loan, type Safety } from '@/data/loans';
import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';
import { CoinPrices, SafetyBar, useZoneColor, zoneText } from './Safety';
import { useLoans } from './useLoans';

export const openLoan = (key: string) => router.push({ pathname: '/loan/[key]', params: { key } });

function LoanRow({ loan, last }: { loan: Loan; last: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const went = loan.deployed.length ? `Went to ${loan.deployed.map((p) => p.name).join(', ')}` : 'Where it went: not set';
  return (
    <Pressable onPress={() => openLoan(loan.key)} accessibilityRole="link" accessibilityLabel={`${loan.name}, ${loan.debtCents === null ? 'no value' : money(loan.debtCents)} owed. ${went}`}
      style={{ minHeight: 64, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{loan.name}</Txt>
        <Txt v="small" c={loan.deployed.length ? 'ink2' : 'ink3'} numberOfLines={1}>{loan.where} · {went}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt v="figure" style={{ fontSize: 15, color: c.down }}>{loan.debtCents === null ? '—' : money(loan.debtCents)}</Txt>
        {loan.resultCents !== null ? <Txt v="figureSm" style={{ color: loan.resultCents >= 0 ? c.upInk : c.down }}>{money(loan.resultCents, { sign: true })}</Txt>
          : loan.ltv !== null ? <Txt v="figureSm" c="ink3">{Math.round(loan.ltv * 100)}% of collateral</Txt> : null}
      </View>
      <Txt v="body" c="ink3">›</Txt>
    </Pressable>
  );
}

/** Every loan with where its money went, on What you owe. Signed-in only: links live in the cloud. */
export function LoansSection() {
  const state = useLoans();
  if (state.status !== 'ready' || !state.loans.length) return null;
  return (
    <View style={{ marginTop: 22 }}>
      <Txt v="label" c="ink3" accessibilityRole="header">LOANS AND WHERE THE MONEY WENT</Txt>
      {state.loans.map((l, i) => <LoanRow key={l.key} loan={l} last={i === state.loans.length - 1} />)}
    </View>
  );
}

/**
 * Crypto loans and how close each is to liquidation, near the end of What you owe. Folded to one line
 * (the closest loan); open, each loan with its zone bar and the price each coin behind it is sold at.
 * Only loans whose protocol reports a health factor; the rest say nothing rather than look safe.
 */
export function LiquidationSection() {
  const state = useLoans();
  const { c } = useTheme();
  const zoneColor = useZoneColor();
  const [open, setOpen] = useState(false);
  if (state.status !== 'ready') return null;
  const rows = state.loans.map((l) => ({ loan: l, safety: safetyOf(l) })).filter((r): r is { loan: Loan; safety: Safety } => r.safety !== null)
    .sort((a, b) => a.safety.health - b.safety.health);
  if (!rows.length) return null;
  const closest = rows[0];
  const fall = (s: Safety) => `−${Math.round(s.cushion * 100)}%`;
  return (
    <View style={{ marginTop: 22, borderRadius: 18, backgroundColor: c.s1 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" aria-expanded={open}
        accessibilityLabel={`Distance to liquidation. Closest: ${closest.loan.name}, can fall ${Math.round(closest.safety.cushion * 100)} percent. ${open ? 'Hide' : 'Show'} each loan`}
        style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt v="label" c="ink3" style={{ flex: 1 }} accessibilityRole="header">DISTANCE TO LIQUIDATION</Txt>
          <Txt v="body" c="ink3" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>›</Txt>
        </View>
        {!open && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Txt v="small" c="ink2" style={{ flex: 1 }} numberOfLines={1}>Closest: {closest.loan.name}</Txt>
              <Txt v="figureSm" style={{ fontSize: 14, color: zoneColor(closest.safety.zone) }}>{fall(closest.safety)}</Txt>
            </View>
            <SafetyBar safety={closest.safety} />
            {rows.length > 1 && <Txt v="small" c="ink3">{rows.length} loans · tap to see each, and the coin prices they’re sold at</Txt>}
          </>
        )}
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }}>
          {rows.map(({ loan, safety }) => (
            <Pressable key={loan.key} onPress={() => openLoan(loan.key)} accessibilityRole="link"
              accessibilityLabel={`${loan.name}, ${loan.where}. ${zoneText(safety)}: can fall ${Math.round(safety.cushion * 100)} percent before it is sold. Open`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Txt v="body" style={{ flex: 1, fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{loan.name}</Txt>
                <Txt v="figureSm" style={{ fontSize: 14, color: zoneColor(safety.zone) }}>{fall(safety)}</Txt>
              </View>
              <SafetyBar safety={safety} />
              <Txt v="small" c="ink3" numberOfLines={1}>{loan.where} · health {safety.health.toFixed(2)}</Txt>
              <CoinPrices safety={safety} dense />
            </Pressable>
          ))}
          <Txt v="small" c="ink3">Each coin’s price is where the loan is sold if only that coin falls. The percentage is how far everything can fall together.</Txt>
        </View>
      )}
    </View>
  );
}
