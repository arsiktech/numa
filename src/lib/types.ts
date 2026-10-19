import type { CurrencyCode } from "./money";

export type { CurrencyCode };

export type PortfolioType = "personal" | "shared" | "family";
export type Role = "owner" | "editor" | "viewer";
export type TxKind = "income" | "expense";
export type CategoryKind = "income" | "expense";
export type HoldingKind = "stock" | "etf" | "crypto" | "index";
export type CryptoWalletAddressType = "evm" | "solana" | "bitcoin";
export type AssetKind = "cash" | "real_estate" | "vehicle" | "collectible" | "business" | "other";
export type LiabilityKind = "credit_card" | "loan" | "mortgage" | "other";
export type Provider = "coingecko" | "alpha-vantage" | "stooq" | "finnhub" | "mock";
export type AppLocale = "en" | "ru" | "es";
export type PodRole = "owner" | "editor" | "viewer";
export type PodSplitMode = "equal_people" | "equal_groups" | "custom" | "covered_group";
export type GoalScope =
  | "net_worth"
  | "monthly_income"
  | "income_category"
  | "asset_value"
  | "holding_value";
export type PrimaryJob = "net_worth" | "daily_spending" | "shared_money";
export type StarterTemplate = "personal_capital" | "couple_family" | "trip_shared_flat";
export type CaptureDestination = "personal" | "pod";
export type CaptureDraftKind =
  | "transaction"
  | "pod_expense"
  | "asset"
  | "liability"
  | "holding"
  | "settlement";
/**
 * `light` is the simple expense tracker + budgeting UI (Money + Settings, big
 * month spend on home). `advanced` is the full app: Wealth + Shared + Holdings
 * + Goals + Money Pods + AI chat. Per-user preference, syncs to Convex via
 * profiles.appMode.
 *
 *  - `light`     — minimal expense tracker. No income, no investments, no AI heavy lifting.
 *  - `advanced`  — full Numa: portfolios, wealth, AI nudges, money pods.
 *  - `shared`    — single-screen shared-pot mode. The app is JUST the joint
 *                  budget: who paid from which card, who owes whom. No
 *                  personal money / wealth surfaces in the nav.
 */
export type AppMode = "light" | "advanced" | "shared";

/**
 * Palette themes that swap the brand + canvas + ink + accent vocabulary.
 * Combine with the existing light/dark Theme to get 8 variants. New users
 * default to "citrus"; existing users (no value) keep the classic Numa
 * purple-on-cream look via the `:root` defaults in tokens.css.
 *
 *   citrus  — lime on near-black, our recommended brand
 *   pebble  — sage, calm
 *   coral   — warm terracotta, magazine
 *   carbon  — mono mint, designer-cool
 *   numa    — original purple-on-cream (the pre-feature default)
 */
export type AppThemeKey = "numa" | "citrus" | "pebble" | "coral" | "carbon";

export interface User {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  defaultCurrency: CurrencyCode;
  theme: "light" | "dark" | "auto";
  /**
   * Light vs. Advanced UI complexity. New users default to "light"; existing
   * users without the field get treated as "advanced" so nothing changes on
   * their next load.
   */
  appMode?: AppMode;
  primaryJob?: PrimaryJob;
  starterTemplate?: StarterTemplate;
  locale?: AppLocale;
}

export interface Membership {
  id: string;
  portfolioId: string;
  userId: string;
  ownershipBps: number; // 10000 = 100 %
  role: Role;
  displayName: string;
  avatarUrl?: string;
  joinedAt: number;
}

export interface Category {
  id: string;
  portfolioId: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  sortOrder: number;
  /** Optional emoji prefix shown next to the icon (MonAi-style). */
  emoji?: string;
  /** Expense cap denomination is fixed when set; legacy caps use the portfolio default. */
  monthlyLimit?: number;
  monthlyLimitCurrency?: CurrencyCode;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  occurredAt: number; // unix ms
  description: string;
  categoryId?: string;
  accountId?: string; // optional link to an Asset (kind=cash) — debits/credits its balance
  kind: TxKind;
  amount: number; // always positive — sign from kind
  currency: CurrencyCode;
  createdByUserId: string;
  splits?: { userId: string; bps: number }[];
  notes?: string;
  /**
   * Optional geo-tag captured at create-time. `label` is a reverse-geocoded
   * "place, city" string from Nominatim; `lat`/`lng` are the raw GPS coords
   * so the label can be regenerated if Nominatim's cache expires.
   */
  location?: { lat: number; lng: number; label?: string };
}

export interface Holding {
  id: string;
  portfolioId: string;
  symbol: string;
  name: string;
  kind: HoldingKind;
  quantity: number;
  costBasis: number;
  currency: CurrencyCode;
  acquiredAt: number;
}

export interface HoldingEvent {
  id: string;
  portfolioId: string;
  holdingId: string;
  symbol: string;
  kind: "buy" | "sell";
  quantity: number;
  unitPrice: number;
  total: number;
  currency: CurrencyCode;
  occurredAt: number;
  notes?: string;
}

export interface CryptoWalletToken {
  id: string;
  chain: string;
  chainName: string;
  tokenAddress?: string;
  symbol: string;
  name: string;
  /** Exact provider-formatted decimal; never coerce on-chain units to JS number. */
  quantity: string;
  priceUsd?: number;
  valueUsd?: number;
  change24h?: number;
  verified: boolean;
  suspectedSpam: boolean;
  /** The same receipt/LP token is already represented by a DeFi position. */
  representedInDefi?: boolean;
}

export type CryptoDefiPositionKind =
  | "supplied"
  | "staked"
  | "liquidity"
  | "borrowed"
  | "rewards"
  | "locked"
  | "other";

export interface CryptoDefiPosition {
  id: string;
  chain: string;
  chainName: string;
  protocol: string;
  label: string;
  positionAddress?: string;
  kind: CryptoDefiPositionKind;
  valueUsd?: number;
  assetValueUsd: number;
  debtValueUsd: number;
  apy?: number;
  healthFactor?: number;
  symbols: string[];
}

export interface CryptoWalletSnapshot {
  // "public": keyless explorers used by the rebuilt app (apps/numa).
  provider: "moralis" | "public";
  addressType: CryptoWalletAddressType;
  tokenValueUsd: number;
  defiValueUsd: number;
  debtValueUsd: number;
  totalValueUsd: number;
  tokens: CryptoWalletToken[];
  defiPositions: CryptoDefiPosition[];
  chains: string[];
  failedChains: string[];
  tokenFailedChains?: string[];
  defiFailedChains?: string[];
  /** All decoded DeFi position-address keys, including rows omitted from display. */
  defiPositionKeys?: string[];
  tokensTruncated?: boolean;
  defiPositionsTruncated?: boolean;
  tokensFetchedAt: number;
  defiFetchedAt?: number;
  /** True when the server intentionally produced a complete token-only snapshot. */
  defiDisabled?: boolean;
  updatedAt: number;
  partial: boolean;
}

export interface CryptoWallet {
  id: string;
  portfolioId: string;
  address: string;
  addressType: CryptoWalletAddressType;
  label: string;
  includeInNetWorth: boolean;
  createdAt: number;
  updatedAt: number;
  snapshot?: CryptoWalletSnapshot;
}

export interface Asset {
  id: string;
  portfolioId: string;
  name: string;
  kind: AssetKind;
  balance: number;
  currency: CurrencyCode;
  notes?: string;
  updatedAt: number;
}

export interface Liability {
  id: string;
  portfolioId: string;
  name: string;
  kind: LiabilityKind;
  balance: number;
  currency: CurrencyCode;
  interestRate?: number;
  dueDate?: number;
  notes?: string;
  updatedAt: number;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  changePercent: number;
  provider: Provider;
  updatedAt: number;
}

export interface WealthSnapshot {
  id: string;
  portfolioId: string;
  takenAt: number;
  netWorth: number;
  liquid: number;
  invested: number;
  hardAssets: number;
  liabilities: number;
  currency: CurrencyCode;
  label?: string;
  isAuto: boolean;
}

export interface Settlement {
  id: string;
  portfolioId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: CurrencyCode;
  occurredAt: number;
  note?: string;
}

export interface NetWorthGoal {
  id: string;
  portfolioId: string;
  scope: GoalScope;
  target: number;
  currency: CurrencyCode;
  /** Progress starts here for cumulative goals like income category targets. */
  startAt: number;
  /** Optional target date (unix ms). */
  deadline?: number;
  /** What the user is tracking — visible in headline. */
  label?: string;
  categoryId?: string;
  assetId?: string;
  holdingId?: string;
  createdAt: number;
}

export type RecurrenceCadence = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringTransaction {
  id: string;
  portfolioId: string;
  description: string;
  categoryId?: string;
  accountId?: string;
  kind: TxKind;
  amount: number;
  currency: CurrencyCode;
  cadence: RecurrenceCadence;
  /** First occurrence — also used to derive day-of-month / weekday for future ones. */
  startAt: number;
  /** Next time the materializer should fire. */
  nextRunAt: number;
  /** Optional kill date. */
  endAt?: number;
  notes?: string;
  active: boolean;
  /** Explicit opt-in for business MRR/ARR; unmarked income is never annualized. */
  revenueType?: RevenueType;
  /** Client or income source used to group recurring income. */
  incomeSource?: string;
  createdAt: number;
}

export type RevenueType = "subscription" | "retainer";

export interface Portfolio {
  spaceKind?: "personal" | "business";
  id: string;
  name: string;
  type: PortfolioType;
  tagline: string;
  ownerId: string;
  defaultCurrency: CurrencyCode;
  createdAt: number;
}

export interface MoneyPod {
  id: string;
  name: string;
  currency: CurrencyCode;
  ownerUserId: string;
  createdAt: number;
}

export interface PodMember {
  id: string;
  podId: string;
  displayName: string;
  email?: string;
  linkedUserId?: string;
  linkedPortfolioId?: string;
  groupId?: string;
  role: PodRole;
  joinedAt: number;
  /**
   * Free-text labels of the payment methods this member uses (e.g. "ZEN",
   * "Revolut", "Cash"). Used by Shared mode to render the "paid with X" chip
   * on each expense. Decoupled from personal portfolio assets on purpose so
   * non-Numa members can be tracked just like Numa-account members.
   */
  cards?: string[];
  /**
   * Tombstone flag. `false` means the member left or was removed; absent/`true`
   * means active. Removed members are kept in settlement math (so balances stay
   * correct and money owed to/from them isn't lost) but filtered out of member
   * pickers and people-list rosters.
   */
  active?: boolean;
  removedAt?: number;
}

export interface PodGroup {
  id: string;
  podId: string;
  name: string;
  color: string;
}

export interface PodExpense {
  id: string;
  podId: string;
  paidByMemberId: string;
  amount: number;
  currency: CurrencyCode;
  description: string;
  categoryId?: string;
  occurredAt: number;
  splitMode: PodSplitMode;
  participantMemberIds: string[];
  /** Custom shares are basis points of the expense among participantMemberIds. */
  customSplits?: { memberId: string; bps: number }[];
  /** For covered_group, the payer paid on behalf of this group. */
  coveredGroupId?: string;
  sourcePortfolioId?: string;
  sourceAccountId?: string;
  /**
   * Free-text label of which of the payer's cards funded this expense (must
   * match one of the strings in `podMembers.cards`). Shown as a chip on the
   * timeline so members can answer "which card did X pay with?" at a glance.
   */
  paidByCard?: string;
  notes?: string;
}

export interface PodSettlement {
  id: string;
  podId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: CurrencyCode;
  occurredAt: number;
  note?: string;
}

export interface NumaState {
  users: User[];
  currentUserId: string;
  activePortfolioId: string;
  portfolios: Portfolio[];
  memberships: Membership[];
  categories: Category[];
  transactions: Transaction[];
  holdings: Holding[];
  holdingEvents: HoldingEvent[];
  cryptoWallets: CryptoWallet[];
  assets: Asset[];
  liabilities: Liability[];
  snapshots: WealthSnapshot[];
  settlements: Settlement[];
  moneyPods: MoneyPod[];
  podMembers: PodMember[];
  podGroups: PodGroup[];
  podExpenses: PodExpense[];
  podSettlements: PodSettlement[];
  recurring: RecurringTransaction[];
  goals: NetWorthGoal[];
  marketQuotes: Record<string, MarketQuote>;
}
