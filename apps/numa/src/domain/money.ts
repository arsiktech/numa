import type { Currency } from './types';

const symbols: Record<Currency, string> = { EUR: '€', USD: '$' };

/** "€899,538" or "€899,538.42". Grouping is fixed to en-US so digits line up in the odometer. */
export function formatMoney(cents: number, currency: Currency = 'EUR', opts: { cents?: boolean; sign?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = symbols[currency] + grouped + (opts.cents ? '.' + frac.toString().padStart(2, '0') : '');
  if (negative) return '−' + body;
  return opts.sign ? '+' + body : body;
}

/** "€256k" for block labels. */
export function formatShort(cents: number, currency: Currency = 'EUR'): string {
  const v = Math.abs(cents) / 100;
  const s = v >= 1_000_000 ? (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v).toString();
  return (cents < 0 ? '−' : '') + symbols[currency] + s;
}

/** "+0.26%" with a real minus sign. */
export function formatPercent(ratio: number, digits = 2): string {
  const v = (ratio * 100).toFixed(digits);
  return ratio < 0 ? '−' + v.replace('-', '') + '%' : '+' + v + '%';
}
