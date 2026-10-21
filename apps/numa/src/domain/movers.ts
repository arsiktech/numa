/** A price-only estimate, or an explicit reason it cannot be made. Amounts are in cents. */
export type MovementEvidence = {
  id: string; name: string; group: string;
  changeCents: number | null; debt?: boolean; percent?: number | null;
  status: 'estimate' | 'stale' | 'missing' | 'uncovered'; reason?: string;
};

export type Mover = {
  id: string; name: string; group: string; cents: number; percent: number | null; debt: boolean;
};
export type MovementCoverage = { id: string; name: string; reason: string; flat: boolean };
export type Movers = {
  available: boolean; headlineCents: number | null; gainers: Mover[]; losers: Mover[];
  coverage: MovementCoverage[]; estimatedCents: number; unexplainedCents: number | null; nothingMoved: boolean;
};

/** Inputs can contain sub-cent arithmetic; only rounded, finite, safe cents reach the UI. */
export function roundedCents(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) ? (rounded === 0 ? 0 : rounded) : null;
}

/**
 * Reconcile displayed estimates to the exact Home headline. The residual is arithmetic only:
 * it provides no evidence of a deposit, a transaction, earnings, or an exchange-rate change.
 */
export function attributeMovers(headline: number | null, evidence: MovementEvidence[]): Movers {
  const headlineCents = roundedCents(headline);
  const gainers: Mover[] = [], losers: Mover[] = [], coverage: MovementCoverage[] = [];
  const seen = new Set<string>();
  let estimatedCents = 0;
  for (const input of evidence) {
    // A position spanning several records appears once; an aggregate and its children must
    // never both be supplied by the adapter. Reject repeated evidence instead of counting twice.
    if (seen.has(input.id)) continue;
    seen.add(input.id);
    const raw = roundedCents(input.changeCents);
    if (input.status !== 'estimate' || raw === null) {
      const reason = input.reason ?? (input.status === 'stale' ? 'No comparable price move (stale)' : 'No comparable price move available');
      coverage.push({ id: input.id, name: input.name, reason, flat: false });
      continue;
    }
    const cents = input.debt ? -raw : raw;
    if (cents === 0) {
      coverage.push({ id: input.id, name: input.name, reason: input.reason ?? 'No price move in this estimate', flat: true });
      continue;
    }
    const row: Mover = { id: input.id, name: input.name, group: input.group, cents, debt: input.debt ?? false, percent: input.percent != null && Number.isFinite(input.percent) ? input.percent : null };
    (cents > 0 ? gainers : losers).push(row);
    estimatedCents += cents;
  }
  const order = (a: Mover, b: Mover) => Math.abs(b.cents) - Math.abs(a.cents) || a.id.localeCompare(b.id);
  gainers.sort(order); losers.sort(order);
  const unexplainedCents = headlineCents === null ? null : roundedCents(headlineCents - estimatedCents);
  const available = headlineCents !== null && unexplainedCents !== null && Number.isSafeInteger(estimatedCents);
  return {
    available, headlineCents: available ? headlineCents : null, gainers: available ? gainers : [], losers: available ? losers : [],
    coverage, estimatedCents: available ? estimatedCents : 0, unexplainedCents: available ? unexplainedCents : null,
    nothingMoved: available && headlineCents === 0 && gainers.length === 0 && losers.length === 0 && coverage.every((c) => c.flat),
  };
}

/** The collapsed row is a sum of the exact displayed cents of its children. */
export function collapseMovers(rows: Mover[], limit = 5) {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  const shown = rows.slice(0, count), more = rows.slice(count);
  return { shown, more, moreCount: more.length, moreCents: more.reduce((sum, row) => sum + row.cents, 0) };
}
