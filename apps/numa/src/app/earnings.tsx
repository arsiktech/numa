import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSession } from '@/cloud/session';
import type { Range, Strategy } from '@/data/earnings';
import { dayText, EarningsChart } from '@/earnings/EarningsChart';
import { useEarnings } from '@/earnings/useEarnings';
import { useTheme } from '@/theme/theme';
import { CurrencyScope, useMoney } from '@/ui/money';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

const RANGES: [Range, string][] = [['7d', '7 days'], ['30d', '30 days'], ['all', 'All']];
const pct = (x: number) => `${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
const dateText = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** What DeFi strategies earned: yield on what they hold, minus interest on what they owe. */
export default function EarningsScreen() {
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to see what your DeFi strategies earn.</Txt></Screen>;
  return <Cloud />;
}

function Cloud() {
  const [range, setRange] = useState<Range>('30d');
  const [picked, setPicked] = useState<number | null>(null);
  const state = useEarnings(range);
  if (state.status !== 'ready') return <Screen><View style={{ marginTop: 60, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View></Screen>;
  return <CurrencyScope currency={state.currency}><Body state={state} range={range} setRange={(r) => { setRange(r); setPicked(null); }} picked={picked} setPicked={setPicked} /></CurrencyScope>;
}

function Body({ state, range, setRange, picked, setPicked }: { state: Extract<ReturnType<typeof useEarnings>, { status: 'ready' }>; range: Range; setRange: (r: Range) => void; picked: number | null; setPicked: (i: number | null) => void }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const e = state.earnings;
  // A tapped day takes over the headline, the way scrubbing does on Home.
  const day = e && picked !== null ? e.series[picked] ?? null : null;
  const head = day ? day.netCents : e?.netCents ?? 0;
  const total = e ? e.strategies.reduce((t, s) => t + Math.max(0, s.netCents), 0) : 0;
  return (
    <Screen>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>CRYPTO</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>DeFi earnings</Txt>

      {!state.tracked ? (
        <Txt v="body" c="ink2" style={{ marginTop: 16 }}>Add a wallet with lending, vaults or staking, and Numa reads what it earns every day.</Txt>
      ) : !e ? (
        <Txt v="body" c="ink2" style={{ marginTop: 16 }}>Earnings are in dollars, and there’s no exchange rate right now to show them in your currency. Try again in a moment.</Txt>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 999, backgroundColor: c.s1, alignSelf: 'flex-start', marginTop: 14 }} accessibilityRole="tablist">
            {RANGES.map(([k, label]) => (
              <Pressable key={k} onPress={() => setRange(k)} accessibilityRole="tab" aria-selected={range === k} style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: range === k ? c.s2 : 'transparent' }}>
                <Txt v="small" style={{ fontFamily: 'Manrope_600SemiBold', color: range === k ? c.ink : c.ink2 }}>{label}</Txt>
              </Pressable>
            ))}
          </View>
          <Txt v="small" c="ink3" style={{ marginTop: 16 }}>{day ? dayText(day.day) : range === 'all' ? 'Since tracking began' : `Last ${range === '7d' ? '7' : '30'} days`}</Txt>
          <Txt v="figure" style={{ marginTop: 2, fontSize: 34, lineHeight: 40, color: head >= 0 ? c.upInk : c.down }}>{money(head, { cents: true, sign: true })}</Txt>
          {day ? (
            <Txt v="body" c="ink2" style={{ marginTop: 4 }}>Total so far {money(day.totalCents, { cents: true, sign: true })}</Txt>
          ) : (
            <>
              <Txt v="body" c="ink2" style={{ marginTop: 4 }}>
                Earned {money(e.earnedCents, { cents: true })}{e.paidCents ? ` · interest ${money(e.paidCents, { cents: true })}` : ''}
              </Txt>
              {e.rate !== null && <Txt v="small" c="ink3" style={{ marginTop: 2 }}>About {pct(e.rate)} a year on what your strategies hold now</Txt>}
            </>
          )}

          {e.series.length > 0 ? (
            <View style={{ marginTop: 22 }}><EarningsChart series={e.series} selected={day ? picked : null} onSelect={setPicked} /></View>
          ) : (
            <View style={{ marginTop: 18, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 4 }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>Tracking since {e.since !== null ? dateText(e.since) : 'today'}</Txt>
              <Txt v="body" c="ink2">Numa reads your strategies every 30 minutes and compares day to day, so the first earnings show after a full day.</Txt>
            </View>
          )}

          <Txt v="label" c="ink3" style={{ marginTop: 26 }} accessibilityRole="header">BY STRATEGY</Txt>
          {e.strategies.map((s, i) => <StrategyRow key={s.key} s={s} share={total > 0 ? Math.max(0, s.netCents) / total : 0} last={i === e.strategies.length - 1} />)}

          {e.unknown > 0 && <Txt v="small" c="warn" style={{ marginTop: 10 }}>{e.unknown} {e.unknown === 1 ? 'reading' : 'readings'} couldn’t be valued and {e.unknown === 1 ? 'is' : 'are'} left out.</Txt>}
          <Txt v="small" c="ink3" style={{ marginTop: 14 }}>
            Earned is what grew in each position’s own coin: lent coins that became more coins, vault shares worth more dollars or ether. Price moves aren’t earnings, and money you moved in or out isn’t counted.{e.since !== null ? ` Since ${dateText(e.since)}.` : ''}
          </Txt>
        </>
      )}
    </Screen>
  );
}

function StrategyRow({ s, share, last }: { s: Strategy; share: number; last: boolean }) {
  const { c } = useTheme();
  const { money } = useMoney();
  const color = s.netCents >= 0 ? c.upInk : c.down;
  return (
    <View accessibilityLabel={`${s.name}, ${s.where}. Net ${money(s.netCents, { sign: true })}`}
      style={{ paddingVertical: 12, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>{s.name}</Txt>
          <Txt v="small" c="ink2" numberOfLines={1}>{s.where}</Txt>
          {s.paidCents > 0 && <Txt v="small" c="ink3">Earned {money(s.earnedCents, { cents: true })} · interest {money(s.paidCents, { cents: true })}</Txt>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="figure" style={{ fontSize: 15, color }}>{money(s.netCents, { cents: true, sign: true })}</Txt>
          {s.rate !== null && <Txt v="figureSm" c="ink3">{pct(s.rate)} a year</Txt>}
        </View>
      </View>
      {/* Its share of what all strategies earned. */}
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.s1, overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, width: `${Math.round(share * 100)}%`, backgroundColor: color, opacity: 0.85 }} />
      </View>
    </View>
  );
}
