// The money model behind the rebuild. Amounts are integer cents in the base currency.

export type Currency = 'EUR' | 'USD';

export type CategoryId = 'crypto' | 'stocks' | 'business' | 'property' | 'cash' | 'things';

/** Where a value came from and how fresh it is. A missing value is never treated as zero. */
export type Valuation =
  | { kind: 'live'; valueCents: number; asOf: string }
  | { kind: 'delayed'; valueCents: number; asOf: string; delayMinutes: number }
  | { kind: 'synced'; valueCents: number; asOf: string; source: string }
  | { kind: 'manual'; valueCents: number; asOf: string; remindAfterDays: number }
  | { kind: 'missing'; lastKnownCents: number | null; lastKnownAt: string | null };

/** How quickly a holding can become cash. Locked and pledged holdings are owned but not liquid. */
export type Liquidity =
  | { kind: 'liquid' }
  | { kind: 'cash' }
  | { kind: 'locked'; until: string }
  | { kind: 'pledged'; against: string }
  | { kind: 'illiquid' };

export type Holding = {
  id: string;
  name: string;
  category: CategoryId;
  quantity?: { amount: number; unit: string };
  valuation: Valuation;
  liquidity: Liquidity;
  changeTodayCents?: number;
};

export type Debt = { id: string; name: string; balanceCents: number };

export type FlowLine = { id: string; label: string; cents: number; recurring?: boolean };

export type MonthFlow = { month: string; incoming: FlowLine[]; outgoing: FlowLine[] };

export type Urgency = 'due' | 'watch' | 'housekeeping';

export type Attention = {
  id: string;
  urgency: Urgency;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  doneText: string;
  dueAt?: string;
  raisedAt: string;
};
