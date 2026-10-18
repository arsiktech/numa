import type { CloudWallet } from '@/cloud/api';
import type { Attention, Currency, Debt, Holding } from '@/domain/types';
import { convertCents, type FxRate } from './fx';

const HOUR = 3_600_000;
/** Balances are checked every 30 minutes; after this long the value is called out as old. */
const STALE_AFTER = 6 * HOUR;
const chainNames: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum', base: 'Base', arbitrum: 'Arbitrum', optimism: 'Optimism', polygon: 'Polygon' };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function walletSource(w: CloudWallet): string {
  if (w.addressType === 'bitcoin') return 'mempool.space';
  const protocols = [...new Set((w.snapshot?.defiPositions ?? []).map((p) => p.protocol))];
  return protocols.length === 0 ? 'Blockscout' : protocols.length === 1 ? `Blockscout and ${protocols[0]}` : `Blockscout and ${protocols.length} DeFi protocols`;
}
/** The id of a wallet's lending debt, listed under What you owe. */
export const walletLoanId = (walletId: string) => `${walletId}:loan`;
export const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** "0.5 BTC", "ETH, USDC and 2 more", or the short address before the first check. */
export function walletDetail(w: CloudWallet): string {
  const tokens = (w.snapshot?.tokens ?? []).filter((t) => Number(t.quantity) > 0);
  if (!tokens.length) return shortAddress(w.address);
  if (tokens.length === 1) return `${tokens[0].quantity} ${tokens[0].symbol}`;
  const symbols = [...new Set(tokens.map((t) => t.symbol))];
  return symbols.length <= 2 ? symbols.join(', ') : `${symbols.slice(0, 2).join(', ')} and ${symbols.length - 2} more`;
}

/**
 * One tracked wallet as a crypto holding in the portfolio currency. Before the first check, or
 * when a coin in it has no price, its value is unknown rather than zero. What it has lent out
 * (an Aave deposit) counts as owned; what it has borrowed goes to `debts`, so What you own and
 * What you owe both show it, and net worth is the same either way.
 */
export function walletHolding(w: CloudWallet, currency: Currency, fx: FxRate | null, now: number, attention: Attention[], debts: Debt[] = []): Holding | 'unconverted' | null {
  if (!w.includeInNetWorth) return null;
  const base = { id: w.id, name: w.label, category: 'crypto' as const, liquidity: { kind: 'liquid' } as const };
  const s = w.snapshot;
  if (!s) return { ...base, valuation: { kind: 'missing', lastKnownCents: null, lastKnownAt: null } };
  const debtUsd = s.debtValueUsd ?? 0;
  const valueCents = convertCents(Math.round((s.totalValueUsd + debtUsd) * 100), 'USD', currency, fx);
  const debtCents = convertCents(Math.round(debtUsd * 100), 'USD', currency, fx);
  if (valueCents === null || debtCents === null) return 'unconverted';
  if (debtCents > 0) debts.push({ id: walletLoanId(w.id), name: `${w.label} loan`, balanceCents: debtCents });
  const asOf = new Date(s.updatedAt).toISOString();
  const raisedAt = new Date(now).toISOString();
  const names = (xs: string[] | undefined) => (xs ?? []).map((c) => chainNames[c] ?? c);
  const tokenGaps = names(s.tokenFailedChains), defiGaps = names(s.defiFailedChains);
  if (s.chains.length && (tokenGaps.length || defiGaps.length)) {
    // Newer checks say which part was missed; tokens and DeFi positions are read from different places.
    const parts = [tokenGaps.length ? `tokens on ${list(tokenGaps)}` : '', defiGaps.length ? `lending and pools on ${list(defiGaps)}` : ''].filter(Boolean);
    attention.push({ id: `wallet-chains-${w.id}`, urgency: 'housekeeping', title: `Couldn’t check ${list(parts)} for ${w.label}`, body: 'Those are left out of the total until the next check. Numa tries again every 30 minutes.', primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt });
  } else if (s.failedChains.length && s.chains.length) {
    const failed = names(s.failedChains);
    attention.push({ id: `wallet-chains-${w.id}`, urgency: 'housekeeping', title: `Couldn’t check ${list(failed)} for ${w.label}`, body: `Counted from ${list(s.chains.map((c) => chainNames[c] ?? c))} only. Numa tries again every 30 minutes.`, primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt });
  }
  const fallback = names(s.tokenFallbackChains);
  if (fallback.length) {
    attention.push({ id: `wallet-fallback-${w.id}`, urgency: 'housekeeping', title: `Only main tokens counted on ${list(fallback)} for ${w.label}`, body: 'That network’s explorer didn’t answer, so Numa read the main coins straight from the chain. Smaller tokens come back when it answers; Numa tries every 30 minutes.', primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt });
  }
  const unpriced = s.tokens.filter((t) => t.valueUsd === undefined && Number(t.quantity) > 0);
  if (unpriced.length) {
    attention.push({ id: `wallet-price-${w.id}`, urgency: 'watch', title: `No price for ${list([...new Set(unpriced.map((t) => t.symbol))])} in ${w.label}`, body: 'Left out of the wallet’s value until a price arrives.', primary: 'Got it', secondary: 'Later', doneText: 'Hidden until you reopen Numa.', raisedAt });
    return { ...base, valuation: { kind: 'missing', lastKnownCents: valueCents, lastKnownAt: asOf } };
  }
  if (now - s.updatedAt > STALE_AFTER) return { ...base, valuation: { kind: 'missing', lastKnownCents: valueCents, lastKnownAt: asOf } };
  return { ...base, valuation: { kind: 'synced', valueCents, asOf, source: walletSource(w) } };
}
