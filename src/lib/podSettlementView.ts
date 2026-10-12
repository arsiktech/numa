import type { CurrencyCode } from "./types";
import type { PodSettlementSummary, PodTransfer } from "./podSettlement";

export type PodSettlementState = "owed_to_user" | "user_owes" | "settled";

export interface PodSettlementView {
  state: PodSettlementState;
  counterpartyName?: string;
  amount: number;
  currency: CurrencyCode;
  label: string;
  detail: string;
  recommendedSettlementDraft?: {
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    currency: CurrencyCode;
  };
}

export function isActionablePodTransfer(transfer: {
  fromName: string;
  toName: string;
  fromPartyId?: string;
  toPartyId?: string;
}) {
  if (transfer.fromPartyId && transfer.toPartyId) {
    return transfer.fromPartyId !== transfer.toPartyId;
  }
  return transfer.fromName !== transfer.toName;
}

export function buildMyPodSettlementView(
  summary: PodSettlementSummary,
  meMemberId: string | undefined,
  currency: CurrencyCode
): PodSettlementView {
  const partyTransfer = biggestPartyTransfer(summary, meMemberId, currency);
  if (!partyTransfer || !meMemberId || partyTransfer.amount <= 0.005) {
    return {
      state: "settled",
      amount: 0,
      currency,
      label: "All settled",
      detail: "No one needs to pay anyone right now."
    };
  }

  if (partyTransfer.direction === "out") {
    return {
      state: "user_owes",
      counterpartyName: partyTransfer.counterpartyName,
      amount: partyTransfer.amount,
      currency,
      label: `You owe ${partyTransfer.counterpartyName}`,
      detail: "Record a settlement when you pay them back.",
      recommendedSettlementDraft: partyTransfer.recommendedSettlementDraft
    };
  }

  return {
    state: "owed_to_user",
    counterpartyName: partyTransfer.counterpartyName,
    amount: partyTransfer.amount,
    currency,
    label: `${partyTransfer.counterpartyName} owes you`,
    detail: "Draft a settlement when they pay you back.",
    recommendedSettlementDraft: partyTransfer.recommendedSettlementDraft
  };
}

export function buildPartySettlementTransfers(summary: PodSettlementSummary): PodTransfer[] {
  const netByPair = new Map<
    string,
    {
      aPartyId: string;
      bPartyId: string;
      aName: string;
      bName: string;
      netFromAToB: number;
      aToBDraft?: Pick<PodTransfer, "fromMemberId" | "toMemberId">;
      bToADraft?: Pick<PodTransfer, "fromMemberId" | "toMemberId">;
    }
  >();

  for (const transfer of summary.transfers) {
    if (!isActionablePodTransfer(transfer)) continue;
    const fromIsA = transfer.fromPartyId <= transfer.toPartyId;
    const [aPartyId, bPartyId] = fromIsA
      ? [transfer.fromPartyId, transfer.toPartyId]
      : [transfer.toPartyId, transfer.fromPartyId];
    const key = `${aPartyId}\u0000${bPartyId}`;
    const current =
      netByPair.get(key) ??
      {
        aPartyId,
        bPartyId,
        aName: fromIsA ? transfer.fromName : transfer.toName,
        bName: fromIsA ? transfer.toName : transfer.fromName,
        netFromAToB: 0
      };
    const fromAtoB = transfer.fromPartyId === aPartyId;
    current.netFromAToB += fromAtoB ? transfer.amount : -transfer.amount;
    if (fromAtoB && !current.aToBDraft) {
      current.aToBDraft = {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId
      };
    }
    if (!fromAtoB && !current.bToADraft) {
      current.bToADraft = {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId
      };
    }
    netByPair.set(key, current);
  }

  return [...netByPair.values()]
    .map((pair) => {
      const amount = Math.abs(pair.netFromAToB);
      if (amount <= 0.005) return null;
      const fromAToB = pair.netFromAToB > 0;
      const draft = fromAToB ? pair.aToBDraft : pair.bToADraft;
      if (!draft) return null;
      return {
        fromMemberId: draft.fromMemberId,
        toMemberId: draft.toMemberId,
        fromPartyId: fromAToB ? pair.aPartyId : pair.bPartyId,
        toPartyId: fromAToB ? pair.bPartyId : pair.aPartyId,
        fromName: fromAToB ? pair.aName : pair.bName,
        toName: fromAToB ? pair.bName : pair.aName,
        amount: Math.round(amount * 100) / 100
      };
    })
    .filter((transfer): transfer is PodTransfer => Boolean(transfer))
    .sort((a, b) => b.amount - a.amount);
}

type PartyTransfer = {
  direction: "in" | "out";
  counterpartyName: string;
  amount: number;
  recommendedSettlementDraft?: PodSettlementView["recommendedSettlementDraft"];
};

function biggestPartyTransfer(
  summary: PodSettlementSummary,
  meMemberId: string | undefined,
  currency: CurrencyCode
): PartyTransfer | null {
  if (!meMemberId) return null;
  const meRow = summary.rows.find((row) => row.memberId === meMemberId);
  if (!meRow) return null;
  const myPartyId = meRow.partyId ?? meMemberId;

  const grouped = new Map<
    string,
    {
      counterpartyName: string;
      netAmount: number;
      transferCount: number;
      recommendedSettlementDraft?: PodSettlementView["recommendedSettlementDraft"];
    }
  >();
  for (const transfer of summary.transfers) {
    if (!isActionablePodTransfer(transfer)) continue;

    const direction =
      transfer.fromPartyId === myPartyId
        ? "out"
        : transfer.toPartyId === myPartyId
          ? "in"
          : null;
    if (!direction) continue;

    const counterpartyName = direction === "out" ? transfer.toName : transfer.fromName;
    const signedAmount = direction === "in" ? transfer.amount : -transfer.amount;
    const key = direction === "out" ? transfer.toPartyId : transfer.fromPartyId;
    const current = grouped.get(key);
    if (current) {
      current.netAmount += signedAmount;
      current.transferCount += 1;
      current.recommendedSettlementDraft = undefined;
      continue;
    }

    grouped.set(key, {
      counterpartyName,
      netAmount: signedAmount,
      transferCount: 1,
      recommendedSettlementDraft: {
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        amount: transfer.amount,
        currency
      }
    });
  }

  const biggest = [...grouped.values()]
    .map((transfer) => ({
      ...transfer,
      direction: transfer.netAmount < 0 ? ("out" as const) : ("in" as const),
      amount: Math.abs(transfer.netAmount)
    }))
    .filter((transfer) => transfer.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)[0];
  if (!biggest) return null;
  return {
    direction: biggest.direction,
    counterpartyName: biggest.counterpartyName,
    amount: biggest.amount,
    recommendedSettlementDraft:
      biggest.transferCount === 1 ? biggest.recommendedSettlementDraft : undefined
  };
}
