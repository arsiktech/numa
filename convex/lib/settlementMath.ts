/**
 * Canonical shared-pot settlement math — the single source of truth for how a
 * pod expense is split, how member balances net out, and how those balances
 * collapse into the fewest transfers.
 *
 * This module is intentionally pure (no Convex runtime, no browser, no FX): it
 * operates on plain shapes with amounts already expressed in one target
 * currency. Both consumers adapt their own types to these shapes:
 *   - client: `src/lib/podSettlement.ts` converts each amount via FX first.
 *   - server: `convex/mobile.ts` passes single-currency amounts through.
 *
 * Keeping the algorithm here (mirrors the `convex/lib/passwordPolicy.ts`
 * pattern) means the preview a user approves is computed by the same code that
 * records the settlement, so the two can never drift.
 */

export type SettlementSplitMode = "equal_people" | "equal_groups" | "covered_group" | "custom";

export interface SettlementMember {
  id: string;
  /** Group the member belongs to, if any. Drives group-based splits. */
  groupId?: string | null;
}

export interface SettlementGroup {
  id: string;
}

export interface SettlementExpense {
  paidByMemberId: string;
  /** Already in the target currency (caller converts via FX if needed). */
  amount: number;
  splitMode: SettlementSplitMode;
  /** Empty means "everyone in the pod". */
  participantMemberIds: string[];
  customSplits?: ReadonlyArray<{ memberId: string; bps: number }>;
  coveredGroupId?: string | null;
}

export interface SettlementPayment {
  fromMemberId: string;
  toMemberId: string;
  /** Already in the target currency. */
  amount: number;
}

export interface SettlementBalanceRow {
  memberId: string;
  paid: number;
  share: number;
  settledIn: number;
  settledOut: number;
  net: number;
}

export interface MinimizedTransfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/** Amounts at or below this (in target currency) are treated as zero. */
export const SETTLEMENT_EPSILON = 0.005;

/**
 * Fractional share of an expense owed by each member, as ratios that sum to ~1
 * (custom splits trust their basis points and may not sum to exactly 1).
 */
export function expenseShareRatios(
  expense: SettlementExpense,
  members: SettlementMember[],
  groups: SettlementGroup[]
): Array<{ memberId: string; ratio: number }> {
  const participants = expense.participantMemberIds.length
    ? members.filter((member) => expense.participantMemberIds.includes(member.id))
    : members;
  if (participants.length === 0) return [];

  if (expense.splitMode === "custom" && expense.customSplits?.length) {
    return expense.customSplits.map((split) => ({
      memberId: split.memberId,
      ratio: Math.max(0, split.bps) / 10000
    }));
  }

  if (expense.splitMode === "equal_groups") {
    const groupsWithMembers = groups
      .map((group) => ({
        group,
        members: participants.filter((member) => member.groupId === group.id)
      }))
      .filter((entry) => entry.members.length > 0);
    const ungrouped = participants.filter((member) => !member.groupId);
    // Each group counts once; each ungrouped participant is its own bucket.
    const buckets = [
      ...groupsWithMembers.map((entry) => entry.members),
      ...ungrouped.map((member) => [member])
    ];
    if (buckets.length > 0) {
      const groupRatio = 1 / buckets.length;
      return buckets.flatMap((bucket) =>
        bucket.map((member) => ({ memberId: member.id, ratio: groupRatio / bucket.length }))
      );
    }
  }

  if (expense.splitMode === "covered_group" && expense.coveredGroupId) {
    const covered = participants.filter((member) => member.groupId === expense.coveredGroupId);
    if (covered.length > 0) {
      return covered.map((member) => ({ memberId: member.id, ratio: 1 / covered.length }));
    }
    // Fall back to the full group when none of its members are participants.
    const coveredFromGroup = members.filter((member) => member.groupId === expense.coveredGroupId);
    if (coveredFromGroup.length > 0) {
      return coveredFromGroup.map((member) => ({
        memberId: member.id,
        ratio: 1 / coveredFromGroup.length
      }));
    }
  }

  return participants.map((member) => ({ memberId: member.id, ratio: 1 / participants.length }));
}

/**
 * Per-member paid/share/settled totals and the resulting net
 * (net = paid − share − settledIn + settledOut). Amounts are not rounded;
 * callers round at the presentation boundary if they need to.
 */
export function computeSettlementBalances(
  members: SettlementMember[],
  expenses: SettlementExpense[],
  settlements: SettlementPayment[],
  groups: SettlementGroup[]
): SettlementBalanceRow[] {
  const rowById = new Map<string, SettlementBalanceRow>();
  for (const member of members) {
    rowById.set(member.id, {
      memberId: member.id,
      paid: 0,
      share: 0,
      settledIn: 0,
      settledOut: 0,
      net: 0
    });
  }

  for (const expense of expenses) {
    const payer = rowById.get(expense.paidByMemberId);
    if (payer) payer.paid += expense.amount;
    for (const { memberId, ratio } of expenseShareRatios(expense, members, groups)) {
      const row = rowById.get(memberId);
      if (row) row.share += expense.amount * ratio;
    }
  }

  for (const settlement of settlements) {
    const from = rowById.get(settlement.fromMemberId);
    const to = rowById.get(settlement.toMemberId);
    if (from) from.settledOut += settlement.amount;
    if (to) to.settledIn += settlement.amount;
  }

  return [...rowById.values()].map((row) => ({
    ...row,
    net: row.paid - row.share - row.settledIn + row.settledOut
  }));
}

/**
 * Greedy debtor↔creditor matching producing the fewest transfers that settle
 * the pod. Options:
 *   - round: round each emitted amount to 2 decimals (server/API behavior).
 *   - partyKeyOf: when two matched members resolve to the same party key
 *     (e.g. a couple), the match is consumed but not emitted — members of one
 *     party never "pay" each other.
 */
export function minimizeTransfers(
  rows: Array<{ memberId: string; net: number }>,
  opts: { round?: boolean; partyKeyOf?: (memberId: string) => string } = {}
): MinimizedTransfer[] {
  const debtors = rows
    .filter((row) => row.net < -SETTLEMENT_EPSILON)
    .map((row) => ({ memberId: row.memberId, amount: -row.net }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = rows
    .filter((row) => row.net > SETTLEMENT_EPSILON)
    .map((row) => ({ memberId: row.memberId, amount: row.net }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: MinimizedTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > SETTLEMENT_EPSILON) {
      const sameParty =
        opts.partyKeyOf !== undefined &&
        opts.partyKeyOf(debtor.memberId) === opts.partyKeyOf(creditor.memberId);
      if (!sameParty) {
        transfers.push({
          fromMemberId: debtor.memberId,
          toMemberId: creditor.memberId,
          amount: opts.round ? Math.round(amount * 100) / 100 : amount
        });
      }
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount <= SETTLEMENT_EPSILON) i += 1;
    if (creditor.amount <= SETTLEMENT_EPSILON) j += 1;
  }
  return transfers;
}
