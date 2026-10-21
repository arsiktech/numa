import type { CloudHolding, CloudWallet } from '@/cloud/api';
import { attributeMovers, type MovementEvidence, type Movers } from '@/domain/movers';
import type { Currency } from '@/domain/types';
import { demoHoldings } from './demo';
import { isFxCurrent, type FxRate } from './fx';
import { hasObservedCoverage, pricedValueAt, validPriceSeries, type HistoryRange, type PriceSeries, type PricedPiece } from './intraday';
import { groupNames, type Item } from './items';
import { positionsOf } from './positions';
import type { Range } from './series';

export type MovementBasis =
  | { kind: 'history'; range: HistoryRange; pieces: PricedPiece[]; history: Record<string, PriceSeries> }
  | { kind: 'quotes' | 'saved' | 'demo' };

export type HomeMovementReport = {
  movers: Movers; from: number; to: number; now: number; range: Range;
  lens: 'net' | 'liquid' | 'cash'; demo: boolean; basis: string; notes: string[];
};

type Input = {
  items: Item[]; basis: MovementBasis; headlineCents: number; from: number; to: number; now: number;
  range: Range; lens: 'net' | 'liquid' | 'cash';
  currency: Currency; fx: FxRate | null;
};

const countedItems = (items: Item[]) => items.filter((i) => i.type !== 'wallet' || (i.raw as CloudWallet).includeInNetWorth);
const missing = (id: string, name: string, group: string, reason: string, status: MovementEvidence['status'] = 'uncovered'): MovementEvidence => ({ id, name, group, reason, status, changeCents: null });

function issue(items: Item[], input: Input): { reason: string; status: 'missing' | 'stale' | 'uncovered' } | null {
  const { from, now, currency, fx } = input;
  // Synced security quotes and wallet snapshots are USD, independent of a holding's
  // purchase/cost currency. Manual records have no comparable price evidence here.
  const needsFx = currency !== 'USD' && items.some((i) => i.type === 'holding' || i.type === 'wallet');
  if (needsFx && !isFxCurrent(fx, now)) return { reason: 'Current exchange rate evidence unavailable (missing, invalid or older than five UTC days)', status: 'missing' };
  if (items.some((i) => i.valueCents === null || !Number.isFinite(i.valueCents))) return { reason: 'Value or exchange rate unavailable', status: 'missing' };
  if (items.some((i) => i.freshness.tone === 'stale')) return { reason: 'No comparable price move (stale)', status: 'stale' };
  if (items.some((i) => i.freshness.tone === 'missing')) return { reason: 'No comparable price move (missing price or rate)', status: 'missing' };
  for (const item of items) {
    if (item.type === 'wallet') {
      const w = item.raw as CloudWallet;
      if (!w.snapshot || w.snapshot.partial || w.snapshot.failedChains.length || w.snapshot.tokenFailedChains?.length || w.snapshot.defiFailedChains?.length || w.snapshot.tokenFallbackChains?.length) {
        return { reason: 'Wallet price or balance coverage is incomplete', status: 'missing' };
      }
      if (w.createdAt > from) return { reason: 'Tracked after the baseline; earlier quantities are not recorded', status: 'uncovered' };
    }
    if (item.type === 'holding') {
      const h = item.raw as CloudHolding;
      if (h.quoteStale || (h.quoteUpdatedAt !== null && now - h.quoteUpdatedAt > 36 * 3_600_000)) return { reason: 'No comparable price move (stale)', status: 'stale' };
      if (!h.quoteProvider || h.quoteProvider === 'mock' || h.quoteUpdatedAt === null || !Number.isFinite(h.marketPrice) || h.marketPrice <= 0) return { reason: 'No comparable price move (missing price)', status: 'missing' };
      if (h.acquiredAt > from) return { reason: 'Acquired after the baseline; earlier quantities are not recorded', status: 'uncovered' };
    }
  }
  return null;
}

function historyEvidence(input: Input, basis: Extract<MovementBasis, { kind: 'history' }>): MovementEvidence[] {
  const items = countedItems(input.items);
  const byId = new Map(items.map((i) => [i.id, i]));
  const positions = (['crypto', 'stocks'] as const).flatMap((g) => positionsOf(items, g));
  const seenItems = new Set<string>();
  const out: MovementEvidence[] = [];
  for (const p of positions) {
    const sources = p.places.map((place) => byId.get(place.itemId)).filter((i): i is Item => !!i);
    sources.forEach((i) => seenItems.add(i.id));
    const id = `${p.group}:${p.key}`, group = groupNames[p.group];
    const problem = issue(sources, input);
    if (problem) { out.push(missing(id, p.name, group, problem.reason, problem.status)); continue; }
    const kind = p.group === 'crypto' ? 'crypto' : 'stock';
    const piece = basis.pieces.find((x) => x.kind === kind && x.symbol === p.key);
    const series = piece && basis.history[piece.symbol.toUpperCase()];
    const ambiguous = piece && basis.pieces.some((x) => x.symbol.toUpperCase() === piece.symbol.toUpperCase() && x.kind !== piece.kind);
    if (!piece || !series || !validPriceSeries(series) || ambiguous) {
      out.push(missing(id, p.name, group, ambiguous ? 'Price history cannot distinguish these symbols' : 'No comparable price history for this period')); continue;
    }
    if (series.observations?.source !== (kind === 'crypto' ? 'coinbase' : 'yahoo') || !hasObservedCoverage(series, basis.range, input.from, input.to, input.now)) {
      out.push(missing(id, p.name, group, 'Actual price observations do not verify Home’s endpoints, age or gaps', 'missing')); continue;
    }
    const before = pricedValueAt(piece, series, input.from);
    const after = input.to === input.now ? piece.valueCents : pricedValueAt(piece, series, input.to);
    if (before === null || after === null) { out.push(missing(id, p.name, group, 'Comparable prices unavailable')); continue; }
    out.push({ id, name: p.name, group, changeCents: after - before, percent: before > 0 ? (after - before) / before : null, status: 'estimate' });
  }
  // Wallet parents are never monetary rows alongside their underlying positions.
  for (const item of items) {
    if (!seenItems.has(item.id)) out.push(missing(`record:${item.id}`, item.name, groupNames[item.group], 'No comparable item values for this period'));
  }
  return out;
}

function quoteEvidence(input: Input): MovementEvidence[] {
  return countedItems(input.items).map((item) => {
    const id = `record:${item.id}`, group = groupNames[item.group];
    const problem = issue([item], input);
    if (problem) return missing(id, item.name, group, problem.reason, problem.status);
    if (item.type !== 'holding') return missing(id, item.name, group, 'No comparable daily value; not assumed unchanged');
    const h = item.raw as CloudHolding;
    if (!Number.isFinite(h.changePercent) || h.changePercent <= -100 || item.changeTodayCents === null || !Number.isFinite(item.changeTodayCents)) {
      return missing(id, item.name, group, 'Daily quote change unavailable', 'missing');
    }
    return {
      id, name: item.name, group, changeCents: input.to === input.from ? 0 : item.changeTodayCents,
      percent: input.to === input.from ? 0 : h.changePercent / 100, debt: item.group === 'debts', status: 'estimate',
    };
  });
}

/** Fictional allocations of the fictional chart, labelled as a simulation, for signed-out demo. */
function demoEvidence(input: Input): MovementEvidence[] {
  const eligible = demoHoldings.filter((h) => (h.category === 'crypto' || h.category === 'stocks') &&
    (input.lens === 'net' || (input.lens === 'liquid' ? h.liquidity.kind === 'liquid' || h.liquidity.kind === 'cash' : h.liquidity.kind === 'cash')));
  if (!eligible.length) return [];
  const weights = eligible.map((_, i) => i % 4 === 3 ? -0.35 : 1 / (i + 1));
  const sum = weights.reduce((s, w) => s + w, 0);
  return eligible.map((h, i) => ({
    id: `demo:${h.id}`, name: h.name, group: groupNames[h.category], status: 'estimate',
    changeCents: input.headlineCents * weights[i] / sum, percent: null,
  }));
}

export function homeMovementReport(input: Input): HomeMovementReport {
  let evidence: MovementEvidence[], basis: string, notes: string[];
  if (input.basis.kind === 'demo') {
    evidence = demoEvidence(input);
    basis = 'Simulated demo contributions';
    notes = ['These fictional price contributions illustrate the demo chart for the selected period and lens. They are not real market returns.'];
  } else if (input.basis.kind === 'history') {
    evidence = historyEvidence(input, input.basis);
    basis = 'Price-only estimates · same chart endpoints';
    notes = ['Price-only estimates revalue current quantities at current FX using Home’s drawing only where actual completed price observations verify the endpoints and gaps. Historical trades and historical exchange rates are not available.', 'Home holds unpriced items and debts at their current values in this chart. Their actual changes are not known; missing price or current FX evidence remains unattributed.'];
  } else if (input.basis.kind === 'quotes') {
    evidence = quoteEvidence(input);
    basis = 'Provider daily price estimates';
    notes = ['These price-only estimates use current quantities and current FX. Home derives this headline from the same daily quote changes. Providers can use different session starts; common starting prices and historical exchange rates are unavailable.', 'Wallets, debts and manual records without comparable daily values are listed under missing coverage. Missing current FX evidence remains unattributed.'];
  } else {
    evidence = countedItems(input.items).map((i) => missing(`record:${i.id}`, i.name, groupNames[i.group], 'Only portfolio totals are available at this baseline'));
    basis = 'Saved portfolio totals · item attribution unavailable';
    notes = ['Comparable item quantities and prices were not saved for these endpoints. Today’s quote moves cannot explain a different historical baseline.'];
  }
  return { movers: attributeMovers(input.headlineCents, evidence), from: input.from, to: input.to, now: input.now, range: input.range, lens: input.lens, demo: input.basis.kind === 'demo', basis, notes };
}
