export type SharedSyncMark = {
  householdId: string;
  unitId: string;
  checkedAt: number;
  readingAt?: number | null;
  stale: boolean;
};

export type SharedRecord = {
  name: string;
  balance: number;
  currency: 'EUR' | 'USD';
  counterparty?: string | null;
  owedBy?: string | null;
  sharedSync?: SharedSyncMark | null;
};

export type SharedCounterparty = {
  unitId: string;
  name: string;
  balance: number;
  currency: 'EUR' | 'USD';
  /** Money the space owes, or money owed to the space. */
  side: 'liability' | 'asset';
  stale: boolean;
};

const prefix = /^Numa Shared · /;

function labelOf(record: SharedRecord): string {
  const named = record.counterparty || record.owedBy || record.name;
  return named.replace(prefix, '').trim() || record.name.replace(prefix, '').trim();
}

/** The synced records for one household, one per counterparty. Other records are left out. */
export function sharedCounterparties(householdId: string, assets: readonly SharedRecord[], liabilities: readonly SharedRecord[]): SharedCounterparty[] {
  const rows: SharedCounterparty[] = [];
  for (const record of liabilities) {
    const sync = record.sharedSync;
    if (!sync || sync.householdId !== householdId) continue;
    rows.push({ unitId: sync.unitId, name: labelOf(record), balance: record.balance, currency: record.currency, side: 'liability', stale: sync.stale });
  }
  for (const record of assets) {
    const sync = record.sharedSync;
    if (!sync || sync.householdId !== householdId) continue;
    rows.push({ unitId: sync.unitId, name: labelOf(record), balance: record.balance, currency: record.currency, side: 'asset', stale: sync.stale });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.unitId.localeCompare(b.unitId));
}

export type LinkState = 'waiting' | 'synced' | 'stale';

/** Stale if the link or any of its records says the last read failed. */
export function linkState(status: 'ok' | 'stale' | null, counterparties: readonly { stale: boolean }[]): LinkState {
  if (status === 'stale' || counterparties.some((row) => row.stale)) return 'stale';
  if (status === 'ok') return 'synced';
  return 'waiting';
}

/** A sentence the person can act on. The key itself is never included. */
export function sharedLinkError(error: unknown): string {
  const data = error && typeof error === 'object' && 'data' in error ? (error as { data?: { message?: string } }).data : null;
  const message = data?.message ?? (error instanceof Error ? error.message : '');
  if (/household id/i.test(message)) return 'That household id isn’t valid.';
  if (/key/i.test(message)) return 'That Pro app key isn’t valid.';
  if (/configured/i.test(message)) return 'Shared balances aren’t available.';
  return 'Couldn’t save that. Try again.';
}
