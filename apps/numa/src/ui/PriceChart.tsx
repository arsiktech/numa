import { useAction } from 'convex/react';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { changeLabel, pointLabel, priceText, tickLabel, type Range } from '@/data/series';
import { useTheme } from '@/theme/theme';
import { ScrubChart } from './ScrubChart';
import { Txt } from './Txt';

type PriceRange = Exclude<Range, 'ALL'>;
const RANGES: PriceRange[] = ['1D', '1W', '1M', '1Y'];
const WORDS: Record<PriceRange, string> = { '1D': 'today', '1W': 'this week', '1M': 'this month', '1Y': 'this year' };

/**
 * The market price of one coin or stock, in dollars, with the same scrubbing as Home. Prices come
 * from the shared price history; a symbol without one shows nothing rather than a flat line.
 */
export function PriceChart({ symbol, kind, now }: { symbol: string; kind: 'crypto' | 'stock'; now: number }) {
  const { c } = useTheme();
  const fetchSeries = useAction(cloud.priceSeries);
  const [range, setRange] = useState<PriceRange>('1M');
  const [store, setStore] = useState<Record<string, { t: number[]; p: number[] } | 'none'>>({});
  const [preview, setPreview] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const key = `${range}|${symbol}`;
  useEffect(() => {
    let alive = true;
    fetchSeries({ range, symbols: [{ symbol, kind }] })
      .then((r) => { if (alive) setStore((all) => ({ ...all, [key]: r[symbol.toUpperCase()] ?? 'none' })); })
      .catch(() => { if (alive) setStore((all) => ({ ...all, [key]: 'none' })); });
    return () => { alive = false; };
  }, [key, range, symbol, kind, fetchSeries]);

  const s = store[key];
  const rangeAvailable = s && s !== 'none' && s.p.length > 1;
  if (s === 'none' && range === '1M') return null;
  const at = preview ?? pinned;
  const values = rangeAvailable ? s.p : [];
  const shown = rangeAvailable ? values[at ?? values.length - 1] : null;
  const change = rangeAvailable ? changeLabel(shown!, values[0]) : null;
  const up = rangeAvailable ? values[values.length - 1] >= values[0] : true;
  const pick = (r: PriceRange) => { setRange(r); setPreview(null); setPinned(null); };

  return (
    <View style={{ marginTop: 22 }}>
      <Txt v="label" c="ink3" accessibilityRole="header">PRICE</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, minHeight: 28 }}>
        <Txt v="figure" style={{ fontSize: 20 }}>{shown === null ? '—' : priceText(shown)}</Txt>
        {change && <Txt v="small" style={{ color: up ? c.up : c.down, fontFamily: 'Manrope_700Bold' }}>{change}</Txt>}
        {/* While the finger is on the line, the date floats above it instead. */}
        <Txt v="small" c="ink3">{preview !== null ? '' : rangeAvailable && pinned !== null ? pointLabel(s.t[pinned], range, now) : s === 'none' ? 'No price history for this range' : WORDS[range]}</Txt>
      </View>
      <View style={{ marginHorizontal: -20, marginTop: 4, minHeight: 150 }}>
        {rangeAvailable && (
          <ScrubChart values={values} times={s.t} height={150} up={up} drawKey={key} pinned={pinned}
            labels={{ times: s.t, at: (i) => pointLabel(s.t[i], range, now), tick: (t) => tickLabel(t, range) }}
            onPreview={setPreview} onPin={(i) => { setPreview(null); setPinned(i >= values.length - 1 ? null : i); }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }} accessibilityRole="tablist">
        {RANGES.map((r) => (
          <Pressable key={r} onPress={() => pick(r)} accessibilityRole="tab" aria-selected={range === r} accessibilityLabel={`Price ${WORDS[r]}`}
            style={{ minWidth: 48, minHeight: 36, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: range === r ? c.s2 : 'transparent' }}>
            <Txt v="small" c={range === r ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }} maxFontSizeMultiplier={1.4}>{r}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
