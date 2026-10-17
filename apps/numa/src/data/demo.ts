// DEMO DATA. The fictional founder portfolio from the approved mockup, used until the app is
// connected to Convex. The UI labels it "Demo data" wherever it is shown; never real owner data.
import type { Attention, Debt, Holding, MonthFlow } from '@/domain/types';
import type { Point, Range } from './series';

const at = '2026-10-11T20:40:00Z';
const live = (valueCents: number) => ({ kind: 'live' as const, valueCents, asOf: at });
const delayed = (valueCents: number) => ({ kind: 'delayed' as const, valueCents, asOf: at, delayMinutes: 15 });
const synced = (valueCents: number, source: string, asOf = '2026-10-09T09:00:00Z') => ({ kind: 'synced' as const, valueCents, asOf, source });
const manual = (valueCents: number, asOf: string, remindAfterDays: number) => ({ kind: 'manual' as const, valueCents, asOf, remindAfterDays });
const liquid = { kind: 'liquid' as const };
const cash = { kind: 'cash' as const };
const illiquid = { kind: 'illiquid' as const };

export const demoNow = new Date(at);

export const demoHoldings: Holding[] = [
  { id: 'btc-ledger', name: 'Bitcoin', category: 'crypto', quantity: { amount: 1, unit: 'BTC' }, valuation: live(9_640_042), liquidity: liquid },
  { id: 'btc-pledged', name: 'Bitcoin (pledged)', category: 'crypto', quantity: { amount: 0.42, unit: 'BTC' }, valuation: live(4_048_800), liquidity: { kind: 'pledged', against: 'usdc-loan' } },
  { id: 'eth', name: 'Ethereum', category: 'crypto', quantity: { amount: 18.5, unit: 'ETH' }, valuation: live(7_215_000), liquidity: liquid },
  { id: 'sol', name: 'Solana', category: 'crypto', quantity: { amount: 210, unit: 'SOL' }, valuation: live(3_780_000), liquidity: liquid },
  { id: 'tokens', name: 'Other tokens', category: 'crypto', valuation: live(920_000), liquidity: liquid },
  { id: 'spcx', name: 'SpaceX', category: 'stocks', quantity: { amount: 400, unit: 'sh' }, valuation: delayed(7_600_000), liquidity: { kind: 'locked', until: '2026-12-09' } },
  { id: 'tsla', name: 'Tesla', category: 'stocks', quantity: { amount: 120, unit: 'sh' }, valuation: delayed(4_440_000), liquidity: liquid },
  { id: 'vwce', name: 'FTSE All-World', category: 'stocks', quantity: { amount: 300, unit: 'sh' }, valuation: delayed(4_200_000), liquidity: liquid },
  { id: 'googl', name: 'Alphabet', category: 'stocks', quantity: { amount: 150, unit: 'sh' }, valuation: delayed(3_150_000), liquidity: liquid },
  { id: 'meta', name: 'Meta', category: 'stocks', quantity: { amount: 40, unit: 'sh' }, valuation: delayed(2_480_000), liquidity: liquid },
  { id: 'amzn', name: 'Amazon', category: 'stocks', quantity: { amount: 80, unit: 'sh' }, valuation: delayed(1_800_000), liquidity: liquid },
  { id: 'biz', name: 'Lumen, Relay, Hush', category: 'business', valuation: synced(20_160_000, 'Stripe', '2026-10-01T00:00:00Z'), liquidity: illiquid },
  { id: 'flat', name: 'Flat', category: 'property', valuation: manual(14_500_000, '2026-06-15T00:00:00Z', 180), liquidity: illiquid },
  { id: 'eur', name: 'Revolut EUR', category: 'cash', valuation: synced(2_100_000, 'Revolut CSV'), liquidity: cash },
  { id: 'usd', name: 'Revolut USD', category: 'cash', valuation: synced(1_564_000, 'Revolut CSV'), liquidity: cash },
  { id: 'usdc', name: 'USDC', category: 'cash', valuation: live(3_412_000), liquidity: cash },
  { id: 'usdg', name: 'USDG', category: 'cash', valuation: live(683_000), liquidity: cash },
  { id: 'watch', name: 'Watch', category: 'things', valuation: manual(1_280_000, '2026-03-11T00:00:00Z', 180), liquidity: illiquid },
  { id: 'car', name: 'Car', category: 'things', valuation: manual(3_800_000, '2026-07-01T00:00:00Z', 180), liquidity: illiquid },
  { id: 'gold', name: 'Gold', category: 'things', quantity: { amount: 5, unit: 'oz' }, valuation: live(1_675_000), liquidity: liquid },
  { id: 'other', name: 'Other things', category: 'things', valuation: manual(50_000, '2026-09-01T00:00:00Z', 365), liquidity: illiquid },
];

export const demoDebts: Debt[] = [
  { id: 'investor', name: 'Investor loan', balanceCents: 5_000_000 },
  { id: 'usdc-loan', name: 'USDC loan', balanceCents: 2_000_000 },
  { id: 'car-loan', name: 'Car loan', balanceCents: 1_420_000 },
  { id: 'card', name: 'Card', balanceCents: 124_000 },
];

export const demoOctober: MonthFlow = {
  month: '2026-10',
  incoming: [
    { id: 'consulting', label: 'Consulting', cents: 600_000 },
    { id: 'lumen', label: 'Lumen', cents: 420_000, recurring: true },
    { id: 'relay', label: 'Relay', cents: 205_000, recurring: true },
    { id: 'hush', label: 'Hush', cents: 120_000, recurring: true },
    { id: 'yield', label: 'Yield', cents: 40_500 },
  ],
  outgoing: [
    { id: 'taxes', label: 'Taxes', cents: 290_000 },
    { id: 'living', label: 'Living', cents: 267_400 },
    { id: 'home', label: 'Home', cents: 189_000 },
    { id: 'business', label: 'Business', cents: 138_600 },
    { id: 'car', label: 'Car', cents: 61_000 },
  ],
};

export const demoAttention: Attention[] = [
  { id: 'tax', urgency: 'due', title: 'Pay Q3 taxes by 20 October', body: 'About €2,140 for IVA and IRPF. Your tax pot covers it.', primary: 'Mark as paid', secondary: 'Estimate', doneText: 'Marked as paid', dueAt: '2026-10-20', raisedAt: '2026-10-01T08:00:00Z' },
  { id: 'usdg', urgency: 'watch', title: 'USDG is 1.3% under its peg', body: '8,000 USDG, about €90 on paper. Three price sources agree.', primary: 'Watch 24h', secondary: 'Dismiss', doneText: 'Watching for 24 hours', raisedAt: '2026-10-11T19:10:00Z' },
  { id: 'watch', urgency: 'housekeeping', title: 'Watch value is 7 months old', body: 'Similar watches sold for €11,900 to €13,400 this month.', primary: 'Use €12,650', secondary: 'My own', doneText: 'Updated to €12,650', raisedAt: '2026-10-11T07:00:00Z' },
];


const specs: Record<Range, [number[], number, number, number]> = {
  '1D': [[897220, 896300, 898100, 897900, 899538], 78, 0.00026, 1],
  '1W': [[891324, 893900, 890100, 895200, 894000, 897900, 899538], 70, 0.0012, 2],
  '1M': [[878078, 872400, 884900, 881200, 892300, 899538], 72, 0.0028, 3],
  '1Y': [[705000, 712400, 698100, 735600, 752300, 741000, 768900, 790200, 812400, 805100, 838700, 871300, 899538], 120, 0.006, 4],
  ALL: [[182000, 260000, 410000, 330000, 268000, 241000, 318000, 402000, 486000, 598000, 655000, 698000, 812000, 899538], 120, 0.012, 5],
};

/** A smooth, deterministic net-worth series in cents that ends at `endCents`. */
export function demoSeries(range: Range, endCents: number): number[] {
  const [anchors, n, amp, seed] = specs[range];
  const last = anchors.length - 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * last;
    const k = Math.min(last - 1, Math.floor(t));
    const f = t - k;
    const base = anchors[k] + (anchors[k + 1] - anchors[k]) * ((1 - Math.cos(f * Math.PI)) / 2);
    const wobble = Math.sin(i * 0.71 + seed) + 0.6 * Math.sin(i * 1.93 + seed * 2.1) + 0.35 * Math.sin(i * 4.1 + seed * 0.7);
    out.push(Math.round((base + wobble * amp * base * Math.sin((i / (n - 1)) * Math.PI)) * 100));
  }
  out[n - 1] = endCents;
  return out;
}

const spanMs: Record<Range, number> = { '1D': 12.5 * 3600e3, '1W': 7 * 864e5, '1M': 30 * 864e5, '1Y': 365 * 864e5, ALL: 5.78 * 365 * 864e5 };
/** The demo series with timestamps, ending now at `endCents`. */
export function demoPoints(range: Range, endCents: number): Point[] {
  const values = demoSeries(range, endCents);
  const n = values.length;
  return values.map((cents, i) => ({ t: Math.round(demoNow.getTime() - spanMs[range] * (1 - i / (n - 1))), cents }));
}

/**
 * Where the demo portfolio's money sits, to show the drill-down: one coin across a hardware
 * wallet, an exchange and a loan, a currency across accounts. Addresses are public examples.
 */
const DEMO_SPLITS: Record<string, { key: string; name: string; unit: string | null; parts: { where: string; detail: string; share: number; tag?: 'pledged' | 'locked' }[] }> = {
  'btc-ledger': { key: 'BTC', name: 'Bitcoin', unit: 'BTC', parts: [
    { where: 'Ledger', detail: 'bc1qxy…0wlh · Bitcoin', share: 0.62 },
    { where: 'Coinbase', detail: 'Exchange account', share: 0.38 },
  ] },
  'btc-pledged': { key: 'BTC', name: 'Bitcoin', unit: 'BTC', parts: [{ where: 'Nexo', detail: 'Collateral for the USDC loan', share: 1, tag: 'pledged' }] },
  eth: { key: 'ETH', name: 'Ethereum', unit: 'ETH', parts: [
    { where: 'MetaMask', detail: '0x3304…566a · Ethereum', share: 12 / 18.5 },
    { where: 'MetaMask', detail: '0x3304…566a · Base', share: 6.5 / 18.5 },
  ] },
  sol: { key: 'SOL', name: 'Solana', unit: 'SOL', parts: [{ where: 'Phantom', detail: '7xKXtg…sgAs · Solana', share: 1 }] },
  tokens: { key: 'item:tokens', name: 'Other tokens', unit: null, parts: [{ where: 'MetaMask', detail: '0x3304…566a · 14 tokens', share: 1 }] },
  spcx: { key: 'SPCX', name: 'SpaceX', unit: 'sh', parts: [{ where: 'Forge', detail: 'Private shares, locked until 9 Dec', share: 1, tag: 'locked' }] },
  tsla: { key: 'TSLA', name: 'Tesla', unit: 'sh', parts: [{ where: 'Interactive Brokers', detail: 'Brokerage account', share: 1 }] },
  vwce: { key: 'VWCE', name: 'FTSE All-World', unit: 'sh', parts: [{ where: 'Trade Republic', detail: 'Savings plan', share: 1 }] },
  googl: { key: 'GOOGL', name: 'Alphabet', unit: 'sh', parts: [{ where: 'Interactive Brokers', detail: 'Brokerage account', share: 1 }] },
  meta: { key: 'META', name: 'Meta', unit: 'sh', parts: [{ where: 'Interactive Brokers', detail: 'Brokerage account', share: 1 }] },
  amzn: { key: 'AMZN', name: 'Amazon', unit: 'sh', parts: [{ where: 'Interactive Brokers', detail: 'Brokerage account', share: 1 }] },
  eur: { key: 'cur:EUR', name: 'Euro', unit: 'EUR', parts: [{ where: 'Revolut', detail: 'Current account', share: 1 }] },
  usd: { key: 'cur:USD', name: 'US dollar', unit: 'USD', parts: [{ where: 'Revolut', detail: 'Current account', share: 1 }] },
  usdc: { key: 'USDC', name: 'USD Coin', unit: 'USDC', parts: [
    { where: 'Coinbase', detail: 'Exchange account', share: 0.7 },
    { where: 'MetaMask', detail: '0x3304…566a · Base', share: 0.3 },
  ] },
  usdg: { key: 'USDG', name: 'Global Dollar', unit: 'USDG', parts: [{ where: 'Kraken', detail: 'Exchange account', share: 1 }] },
};

export function demoPlaces(h: Holding) {
  const split = DEMO_SPLITS[h.id];
  const cents = h.valuation.kind === 'missing' ? null : h.valuation.valueCents;
  if (!split) return undefined;
  return split.parts.map((p, i) => ({
    key: split.key, name: split.name, unit: split.unit, where: p.where, detail: p.detail, tag: p.tag,
    quantity: h.quantity ? Math.round(h.quantity.amount * p.share * 1e8) / 1e8 : null,
    // The last part takes the rounding, so the parts add up to the record exactly.
    valueCents: cents === null ? null : i === split.parts.length - 1 ? cents - split.parts.slice(0, -1).reduce((t, q) => t + Math.round(cents * q.share), 0) : Math.round(cents * p.share),
  }));
}
