import { convertCurrency, UNKNOWN_FX_RATES, type FxRates } from "./fx";
import {
  computeSettlementBalances,
  minimizeTransfers as minimizeCoreTransfers,
  type SettlementExpense,
  type SettlementPayment
} from "../../convex/lib/settlementMath";
import type {
  CurrencyCode,
  PodExpense,
  PodGroup,
  PodMember,
  PodSettlement
} from "./types";

export interface PodBalanceRow {
  memberId: string;
  displayName: string;
  groupName?: string;
  /** Stable settlement-party id (groupId when grouped, memberId otherwise). */
  partyId?: string;
  paid: number;
  share: number;
  settledOut: number;
  settledIn: number;
  net: number;
}

export interface PodTransfer {
  fromMemberId: string;
  toMemberId: string;
  /** Stable settlement-party ids (groupId when grouped, memberId otherwise). Key any grouping/netting on these. */
  fromPartyId: string;
  toPartyId: string;
  /** Display only — names can collide between distinct parties. */
  fromName: string;
  toName: string;
  amount: number;
}

export interface PodSettlementSummary {
  rows: PodBalanceRow[];
  transfers: PodTransfer[];
  totalExpenses: number;
}

interface FxOpts {
  rates: FxRates | null;
  currency: CurrencyCode;
}

/**
 * Client-side settlement: convert every amount to the pod display currency via
 * FX, then defer the split/balance/minimize math to the shared core in
 * `convex/lib/settlementMath.ts` so the preview matches what the server
 * records. This layer owns FX, the human-readable party names, and the
 * `totalExpenses` rollup.
 */
export function computePodSettlement(
  members: PodMember[],
  groups: PodGroup[],
  expenses: PodExpense[],
  settlements: PodSettlement[],
  fx: FxOpts
): PodSettlementSummary {
  const rates = fx.rates ?? UNKNOWN_FX_RATES;
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const nameById = new Map(
    members.map((member) => [
      member.id,
      {
        displayName: member.displayName,
        groupName: member.groupId ? groupById.get(member.groupId)?.name : undefined
      }
    ])
  );

  const convertedExpenses: SettlementExpense[] = expenses.map((expense) => ({
    paidByMemberId: expense.paidByMemberId,
    amount: convertCurrency(expense.amount, expense.currency, fx.currency, rates),
    splitMode: expense.splitMode,
    participantMemberIds: expense.participantMemberIds,
    customSplits: expense.customSplits,
    coveredGroupId: expense.coveredGroupId
  }));
  const convertedSettlements: SettlementPayment[] = settlements.map((settlement) => ({
    fromMemberId: settlement.fromMemberId,
    toMemberId: settlement.toMemberId,
    amount: convertCurrency(settlement.amount, settlement.currency, fx.currency, rates)
  }));

  const totalExpenses = convertedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const coreRows = computeSettlementBalances(
    members.map((member) => ({ id: member.id, groupId: member.groupId })),
    convertedExpenses,
    convertedSettlements,
    groups.map((group) => ({ id: group.id }))
  );

  const memberById = new Map(members.map((member) => [member.id, member]));
  const partyId = (memberId: string) => memberById.get(memberId)?.groupId ?? memberId;

  const rows: PodBalanceRow[] = coreRows.map((row) => ({
    memberId: row.memberId,
    displayName: nameById.get(row.memberId)?.displayName ?? "",
    groupName: nameById.get(row.memberId)?.groupName,
    partyId: partyId(row.memberId),
    paid: row.paid,
    share: row.share,
    settledOut: row.settledOut,
    settledIn: row.settledIn,
    net: row.net
  }));

  const partyName = (memberId: string) => {
    const name = nameById.get(memberId);
    return name?.groupName ?? name?.displayName ?? memberId;
  };
  const transfers: PodTransfer[] = minimizeCoreTransfers(coreRows).map((transfer) => ({
    fromMemberId: transfer.fromMemberId,
    toMemberId: transfer.toMemberId,
    fromPartyId: partyId(transfer.fromMemberId),
    toPartyId: partyId(transfer.toMemberId),
    fromName: partyName(transfer.fromMemberId),
    toName: partyName(transfer.toMemberId),
    amount: transfer.amount
  }));

  return { rows, transfers, totalExpenses };
}
