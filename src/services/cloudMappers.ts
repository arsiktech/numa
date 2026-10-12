import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type {
  Asset,
  Category,
  CryptoWallet,
  Holding,
  HoldingEvent,
  Liability,
  Membership,
  NetWorthGoal,
  PodExpense,
  PodGroup,
  PodMember,
  PodSettlement,
  RecurringTransaction,
  Settlement,
  Transaction,
  WealthSnapshot
} from "@/lib/types";

/**
 * Convex document shapes (derived from the generated query signatures) and
 * the one-way mappers into app domain types. Extracted from cloudStore.tsx —
 * the store owns transport and subscriptions; this module owns shape mapping.
 */

export type ConvexMembership = NonNullable<
  ReturnType<typeof useQuery<typeof api.memberships.listForPortfolio>>
>[number];
export type ConvexCategory = NonNullable<
  ReturnType<typeof useQuery<typeof api.categories.listForPortfolio>>
>[number];
export type ConvexTransaction = NonNullable<
  ReturnType<typeof useQuery<typeof api.transactions.listForPortfolio>>
>[number];
export type ConvexHolding = NonNullable<
  ReturnType<typeof useQuery<typeof api.holdings.listForPortfolio>>
>[number];
export type ConvexHoldingEvent = NonNullable<
  ReturnType<typeof useQuery<typeof api.holdings.listEventsForPortfolio>>
>[number];
export type ConvexCryptoWallet = NonNullable<
  ReturnType<typeof useQuery<typeof api.cryptoWallets.listForPortfolio>>
>[number];
export type ConvexAsset = NonNullable<
  ReturnType<typeof useQuery<typeof api.assets.listForPortfolio>>
>[number];
export type ConvexLiability = NonNullable<
  ReturnType<typeof useQuery<typeof api.liabilities.listForPortfolio>>
>[number];
export type ConvexSnapshot = NonNullable<
  ReturnType<typeof useQuery<typeof api.wealthSnapshots.listForPortfolio>>
>[number];
export type ConvexSettlement = NonNullable<
  ReturnType<typeof useQuery<typeof api.settlements.listForPortfolio>>
>[number];
export type ConvexRecurring = NonNullable<
  ReturnType<typeof useQuery<typeof api.recurring.listForPortfolio>>
>[number];
export type ConvexGoal = NonNullable<
  ReturnType<typeof useQuery<typeof api.goals.listForPortfolio>>
>[number];
export type ConvexPodMember = NonNullable<
  ReturnType<typeof useQuery<typeof api.moneyPods.listMembers>>
>[number];
export type ConvexPodGroup = NonNullable<
  ReturnType<typeof useQuery<typeof api.moneyPods.listGroups>>
>[number];
export type ConvexPodExpense = NonNullable<
  ReturnType<typeof useQuery<typeof api.moneyPods.listExpenses>>
>[number];
export type ConvexPodSettlement = NonNullable<
  ReturnType<typeof useQuery<typeof api.moneyPods.listSettlements>>
>[number];

export function mapMembership(m: ConvexMembership): Membership {
  return {
    id: String(m._id),
    portfolioId: String(m.portfolioId),
    userId: String(m.userId),
    ownershipBps: m.ownershipBps,
    role: m.role,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    joinedAt: m.joinedAt
  };
}

export function mapCategory(c: ConvexCategory, portfolioId: string): Category {
  return {
    id: String(c._id),
    portfolioId,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sortOrder,
    emoji: c.emoji,
    monthlyLimit: c.monthlyLimit,
    monthlyLimitCurrency: c.monthlyLimitCurrency
  };
}

export function mapTransaction(t: ConvexTransaction, portfolioId: string): Transaction {
  // Defensive: a malformed `occurredAt` (NaN / undefined / 0) silently
  // breaks every date-fns call downstream (SearchDialog, sparkline, money
  // page rollups). Coerce to "now" so the row stays usable instead of
  // crashing the UI on every search keystroke.
  const occurredAt =
    Number.isFinite(t.occurredAt) && t.occurredAt > 0 ? t.occurredAt : Date.now();
  return {
    id: String(t._id),
    portfolioId,
    occurredAt,
    description: t.description,
    categoryId: t.categoryId ? String(t.categoryId) : undefined,
    accountId: t.accountId ? String(t.accountId) : undefined,
    kind: t.kind,
    amount: t.amount,
    currency: t.currency,
    createdByUserId: String(t.createdByUserId),
    splits: t.splits?.map((s) => ({ userId: String(s.userId), bps: s.bps })),
    notes: t.notes,
    location: t.location
  };
}

export function mapHolding(h: ConvexHolding, portfolioId: string): Holding {
  return {
    id: String(h._id),
    portfolioId,
    symbol: h.symbol,
    name: h.name,
    kind: h.kind,
    quantity: h.quantity,
    costBasis: h.costBasis,
    currency: h.currency,
    acquiredAt: h.acquiredAt
  };
}

export function mapHoldingEvent(h: ConvexHoldingEvent, portfolioId: string): HoldingEvent {
  return {
    id: String(h._id),
    portfolioId,
    holdingId: String(h.holdingId),
    symbol: h.symbol,
    kind: h.kind,
    quantity: h.quantity,
    unitPrice: h.unitPrice,
    total: h.total,
    currency: h.currency,
    occurredAt: h.occurredAt,
    notes: h.notes
  };
}

export function mapCryptoWallet(
  wallet: ConvexCryptoWallet,
  portfolioId: string
): CryptoWallet {
  return {
    id: String(wallet._id),
    portfolioId,
    address: wallet.address,
    addressType: wallet.addressType,
    label: wallet.label,
    includeInNetWorth: wallet.includeInNetWorth,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    snapshot: wallet.snapshot
  };
}

export function mapAsset(a: ConvexAsset, portfolioId: string): Asset {
  return {
    id: String(a._id),
    portfolioId,
    name: a.name,
    kind: a.kind,
    balance: a.balance,
    currency: a.currency,
    notes: a.notes,
    updatedAt: a.updatedAt
  };
}

export function mapLiability(l: ConvexLiability, portfolioId: string): Liability {
  return {
    id: String(l._id),
    portfolioId,
    name: l.name,
    kind: l.kind,
    balance: l.balance,
    currency: l.currency,
    interestRate: l.interestRate,
    dueDate: l.dueDate,
    notes: l.notes,
    updatedAt: l.updatedAt
  };
}

export function mapSnapshot(s: ConvexSnapshot, portfolioId: string): WealthSnapshot {
  return {
    id: String(s._id),
    portfolioId,
    takenAt: s.takenAt,
    netWorth: s.netWorth,
    liquid: s.liquid,
    invested: s.invested,
    hardAssets: s.hardAssets,
    liabilities: s.liabilities,
    currency: s.currency,
    label: s.label,
    isAuto: s.isAuto
  };
}

export function mapSettlement(s: ConvexSettlement, portfolioId: string): Settlement {
  return {
    id: String(s._id),
    portfolioId,
    fromUserId: String(s.fromUserId),
    toUserId: String(s.toUserId),
    amount: s.amount,
    currency: s.currency,
    occurredAt: s.occurredAt,
    note: s.note
  };
}

export function mapRecurring(r: ConvexRecurring, portfolioId: string): RecurringTransaction {
  return {
    id: String(r._id),
    portfolioId,
    description: r.description,
    categoryId: r.categoryId ? String(r.categoryId) : undefined,
    accountId: r.accountId ? String(r.accountId) : undefined,
    kind: r.kind,
    amount: r.amount,
    currency: r.currency,
    cadence: r.cadence,
    startAt: r.startAt,
    nextRunAt: r.nextRunAt,
    endAt: r.endAt,
    notes: r.notes,
    active: r.active,
    revenueType: r.revenueType,
    incomeSource: r.incomeSource,
    createdAt: r.createdAt
  };
}

export function mapGoal(g: ConvexGoal, portfolioId: string): NetWorthGoal {
  return {
    id: String(g._id),
    portfolioId,
    scope: g.scope,
    target: g.target,
    currency: g.currency,
    startAt: g.startAt,
    deadline: g.deadline,
    label: g.label,
    categoryId: g.categoryId ? String(g.categoryId) : undefined,
    assetId: g.assetId ? String(g.assetId) : undefined,
    holdingId: g.holdingId ? String(g.holdingId) : undefined,
    createdAt: g.createdAt
  };
}

export function mapPodMember(m: ConvexPodMember): PodMember {
  return {
    id: String(m._id),
    podId: String(m.podId),
    displayName: m.displayName,
    email: m.invitedEmail,
    linkedUserId: m.linkedUserId ? String(m.linkedUserId) : undefined,
    linkedPortfolioId: m.linkedPortfolioId ? String(m.linkedPortfolioId) : undefined,
    groupId: m.groupId ? String(m.groupId) : undefined,
    role: m.role,
    joinedAt: m.joinedAt,
    cards: m.cards,
    active: m.active,
    removedAt: m.removedAt
  };
}

export function mapPodGroup(g: ConvexPodGroup): PodGroup {
  return {
    id: String(g._id),
    podId: String(g.podId),
    name: g.name,
    color: g.color
  };
}

export function mapPodExpense(e: ConvexPodExpense): PodExpense {
  return {
    id: String(e._id),
    podId: String(e.podId),
    paidByMemberId: String(e.paidByMemberId),
    amount: e.amount,
    currency: e.currency,
    description: e.description,
    categoryId: e.categoryId ? String(e.categoryId) : undefined,
    occurredAt: e.occurredAt,
    splitMode: e.splitMode,
    participantMemberIds: e.participantMemberIds.map(String),
    customSplits: e.customSplits?.map((s) => ({
      memberId: String(s.memberId),
      bps: s.bps
    })),
    coveredGroupId: e.coveredGroupId ? String(e.coveredGroupId) : undefined,
    sourcePortfolioId: e.sourcePortfolioId ? String(e.sourcePortfolioId) : undefined,
    sourceAccountId: e.sourceAccountId ? String(e.sourceAccountId) : undefined,
    paidByCard: e.paidByCard,
    notes: e.notes
  };
}

export function mapPodSettlement(s: ConvexPodSettlement): PodSettlement {
  return {
    id: String(s._id),
    podId: String(s.podId),
    fromMemberId: String(s.fromMemberId),
    toMemberId: String(s.toMemberId),
    amount: s.amount,
    currency: s.currency,
    occurredAt: s.occurredAt,
    note: s.note
  };
}

/* ------------------------------------------------------------------ */
/*  Public consumer hooks                                              */
/* ------------------------------------------------------------------ */

