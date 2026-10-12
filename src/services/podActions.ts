import type { Id, TableNames } from "../../convex/_generated/dataModel";
import { newId } from "@/lib/ids";
import type {
  CurrencyCode,
  PodExpense,
  PodGroup,
  PodMember,
  PodRole,
  PodSettlement,
  PodSplitMode
} from "@/lib/types";
import { useCloudMutations, useCloudState } from "./cloudStore";
import { useNuma } from "./store";
import { useWriteQueue } from "./writeQueue";

interface CreateMoneyPodInput {
  name: string;
  currency: CurrencyCode;
  groups?: Array<{ name: string; color: string }>;
  members?: Array<{
    displayName: string;
    email: string;
    groupIndex?: number;
    role?: PodRole;
    linkedPortfolioId?: string;
  }>;
}

type AddPodMemberInput = {
  podId: string;
  displayName: string;
  email: string;
  groupId?: string;
  role?: PodRole;
  cards?: string[];
};

type AddPodGroupInput = {
  podId: string;
  name: string;
  color: string;
};

type AddPodExpenseInput = Omit<PodExpense, "id"> & {
  id?: string;
  /**
   * Optional caller-stable idempotency key. Batch entry flows mint one id per
   * entry BEFORE the save loop and reuse it on retry, so re-submitting a
   * partially-failed batch replays into mutation receipts instead of
   * double-inserting the entries that already committed.
   */
  clientMutationId?: string;
};
type AddPodSettlementInput = Omit<PodSettlement, "id"> & { id?: string };
type UpdatePodSettlementPatch = Partial<Omit<PodSettlement, "id" | "podId">>;
type CloudCurrency = "USD" | "EUR";

function idAs<T extends TableNames>(id: string): Id<T> {
  return id as unknown as Id<T>;
}

function asCloudCurrency(currency: CurrencyCode): CloudCurrency {
  if (currency === "USD" || currency === "EUR") return currency;
  throw new Error("Money pods currently support USD and EUR in cloud mode.");
}

function clientMutationId(operation: string) {
  return `${operation}:${newId("mut")}`;
}

function assertDistinctSettlementMembers(fromMemberId: string, toMemberId: string) {
  if (fromMemberId === toMemberId) {
    throw new Error("Settlement payer and recipient must be different.");
  }
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isEmailLike(email: string | undefined | null): boolean {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function displayNameFromEmail(email: string): string {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || email;
}

export function usePodActions() {
  const { state, dispatch } = useNuma();
  const cloud = useCloudState();
  const mutations = useCloudMutations();
  const queue = useWriteQueue();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const cloudPodIds = new Set(cloud.moneyPods.map((p) => p.id));
  const isCloudPod = (podId: string) => cloud.enabled && cloudPodIds.has(podId);

  async function runQueuedCloudMutation<T>(
    operation: string,
    payload: Record<string, unknown>,
    execute: (payload: Record<string, unknown>) => Promise<T>,
    fallback: Record<string, unknown>,
    presetClientMutationId?: string
  ) {
    const id = presetClientMutationId ?? clientMutationId(operation);
    const result = await queue.runOrQueue({
      operation,
      payload: { ...payload, clientMutationId: id },
      clientMutationId: id,
      execute
    });
    if (result.queued) {
      // Offline/transient: the write is parked in the durable queue. Callers
      // that promise a server-confirmed outcome (leave/delete pot) branch on
      // this instead of pretending the mutation already applied.
      return { ...fallback, clientMutationId: result.clientMutationId, queued: true };
    }
    const raw = result.result;
    const base =
      raw !== null && raw !== undefined && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : raw !== null && raw !== undefined
          ? { id: String(raw) }
          : fallback;
    return { ...base, queued: false };
  }

  async function createMoneyPod(input: CreateMoneyPodInput): Promise<string> {
    if (cloud.enabled) {
      const result = await mutations.createMoneyPod({
        clientMutationId: clientMutationId("moneyPods.create"),
        name: input.name,
        currency: asCloudCurrency(input.currency),
        groups: input.groups,
        members: input.members
          ?.filter((member) => isEmailLike(member.email))
          .map((member) => ({
            displayName: member.displayName,
            email: member.email.trim().toLowerCase(),
            groupIndex: member.groupIndex,
            role: member.role ?? "editor",
            linkedPortfolioId: member.linkedPortfolioId
              ? idAs<"portfolios">(member.linkedPortfolioId)
              : undefined
          }))
      });
      return String(result.id);
    }

    const podId = newId("pod");
    const now = Date.now();
    const groups: PodGroup[] = (input.groups ?? []).map((group) => ({
      id: newId("pg"),
      podId,
      name: group.name,
      color: group.color
    }));
    const owner: PodMember = {
      id: newId("pm"),
      podId,
      displayName: me.displayName,
      linkedUserId: me.id,
      email: me.email,
      role: "owner",
      groupId: groups[0]?.id,
      joinedAt: now
    };
    const members: PodMember[] = (input.members ?? [])
      .filter((member) => isEmailLike(member.email))
      .map((member) => {
        const email = member.email.trim().toLowerCase();
        return {
          id: newId("pm"),
          podId,
          displayName: member.displayName.trim() || displayNameFromEmail(email),
          email,
          linkedPortfolioId: member.linkedPortfolioId,
          groupId:
            member.groupIndex !== undefined && member.groupIndex >= 0
              ? groups[member.groupIndex]?.id
              : undefined,
          role: member.role ?? "editor",
          joinedAt: now
        };
      });

    dispatch({
      type: "addMoneyPod",
      pod: {
        id: podId,
        name: input.name.trim() || "Home",
        currency: input.currency,
        ownerUserId: me.id,
        createdAt: now
      },
      members: [owner, ...members],
      groups
    });
    return podId;
  }

  async function updateMoneyPod(podId: string, patch: { name?: string }) {
    if (isCloudPod(podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.update",
        {
        podId: idAs<"moneyPods">(podId),
        name: patch.name
        },
        (payload) => mutations.updateMoneyPod(payload as any),
        { id: podId, replayed: false }
      );
    }
    dispatch({ type: "updateMoneyPod", id: podId, patch });
    return { id: podId, clientMutationId: undefined, replayed: false };
  }

  async function deleteMoneyPod(podId: string) {
    if (isCloudPod(podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.remove",
        {
        podId: idAs<"moneyPods">(podId)
        },
        (payload) => mutations.removeMoneyPod(payload as any),
        { id: podId, replayed: false }
      );
    }
    dispatch({ type: "deleteMoneyPod", id: podId });
    return { id: podId, clientMutationId: undefined, replayed: false };
  }

  async function leaveMoneyPod(podId: string) {
    if (isCloudPod(podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.leaveMoneyPod",
        {
          podId: idAs<"moneyPods">(podId)
        },
        (payload) => mutations.leaveMoneyPod(payload as any),
        { id: podId, replayed: false }
      );
    }
    // Local fallback: leaving simply drops the pod from this device's view.
    dispatch({ type: "deleteMoneyPod", id: podId });
    return { id: podId, clientMutationId: undefined, replayed: false };
  }

  async function addPodMember(input: AddPodMemberInput) {
    if (isCloudPod(input.podId)) {
      // Queued like the update/delete siblings so offline/transient failures
      // are retried idempotently instead of thrown away (QA 2026-06-24).
      return await runQueuedCloudMutation(
        "moneyPods.addMember",
        {
          podId: idAs<"moneyPods">(input.podId),
          displayName: input.displayName,
          email: input.email.trim().toLowerCase(),
          groupId: input.groupId ? idAs<"podGroups">(input.groupId) : undefined,
          role: input.role ?? "editor",
          cards: input.cards
        },
        (payload) => mutations.addPodMember(payload as any),
        // No server id yet when queued offline; callers tolerate undefined id.
        { id: undefined, replayed: false }
      );
    }

    const member: PodMember = {
      id: newId("pm"),
      podId: input.podId,
      displayName: input.displayName.trim() || displayNameFromEmail(input.email),
      email: input.email.trim().toLowerCase(),
      groupId: input.groupId,
      role: input.role ?? "editor",
      joinedAt: Date.now(),
      cards: input.cards
    };
    dispatch({ type: "addPodMember", member });
    return { id: member.id, clientMutationId: undefined, replayed: false };
  }

  async function updatePodMember(
    memberId: string,
    podId: string,
    patch: Partial<Pick<PodMember, "displayName" | "groupId" | "cards">>
  ) {
    if (isCloudPod(podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.updateMember",
        {
        memberId: idAs<"podMembers">(memberId),
        displayName: patch.displayName,
        groupId: hasOwn(patch, "groupId")
          ? patch.groupId
            ? idAs<"podGroups">(patch.groupId)
            : null
          : undefined,
        cards: patch.cards
        },
        (payload) => mutations.updatePodMember(payload as any),
        { id: memberId, replayed: false }
      );
    }
    dispatch({ type: "updatePodMember", id: memberId, patch });
    return { id: memberId, clientMutationId: undefined, replayed: false };
  }

  async function deletePodMember(member: Pick<PodMember, "id" | "podId">) {
    if (isCloudPod(member.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.removeMember",
        {
        memberId: idAs<"podMembers">(member.id)
        },
        (payload) => mutations.removePodMember(payload as any),
        { id: member.id, replayed: false }
      );
    }
    dispatch({ type: "deletePodMember", id: member.id });
    return { id: member.id, clientMutationId: undefined, replayed: false };
  }

  async function addPodGroup(input: AddPodGroupInput) {
    if (isCloudPod(input.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.addGroup",
        {
          podId: idAs<"moneyPods">(input.podId),
          name: input.name,
          color: input.color
        },
        (payload) => mutations.addPodGroup(payload as any),
        { id: undefined, replayed: false }
      );
    }
    const group: PodGroup = { id: newId("pg"), ...input };
    dispatch({ type: "addPodGroup", group });
    return { id: group.id, clientMutationId: undefined, replayed: false };
  }

  async function updatePodGroup(
    group: Pick<PodGroup, "id" | "podId">,
    patch: Partial<Pick<PodGroup, "name" | "color">>
  ) {
    if (isCloudPod(group.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.updateGroup",
        {
        groupId: idAs<"podGroups">(group.id),
        name: patch.name,
        color: patch.color
        },
        (payload) => mutations.updatePodGroup(payload as any),
        { id: group.id, replayed: false }
      );
    }
    dispatch({ type: "updatePodGroup", id: group.id, patch });
    return { id: group.id, clientMutationId: undefined, replayed: false };
  }

  async function deletePodGroup(group: Pick<PodGroup, "id" | "podId">) {
    if (isCloudPod(group.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.removeGroup",
        {
        groupId: idAs<"podGroups">(group.id)
        },
        (payload) => mutations.removePodGroup(payload as any),
        { id: group.id, replayed: false }
      );
    }
    dispatch({ type: "deletePodGroup", id: group.id });
    return { id: group.id, clientMutationId: undefined, replayed: false };
  }

  async function addPodExpense(input: AddPodExpenseInput) {
    if (isCloudPod(input.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.addExpense",
        {
          podId: idAs<"moneyPods">(input.podId),
          paidByMemberId: idAs<"podMembers">(input.paidByMemberId),
          paidByCard: input.paidByCard,
          amount: input.amount,
          currency: asCloudCurrency(input.currency),
          description: input.description,
          categoryId: input.categoryId ? idAs<"categories">(input.categoryId) : undefined,
          occurredAt: input.occurredAt,
          splitMode: input.splitMode,
          participantMemberIds: input.participantMemberIds.map((id) => idAs<"podMembers">(id)),
          customSplits: input.customSplits?.map((split) => ({
            memberId: idAs<"podMembers">(split.memberId),
            bps: split.bps
          })),
          coveredGroupId: input.coveredGroupId ? idAs<"podGroups">(input.coveredGroupId) : undefined,
          sourcePortfolioId: input.sourcePortfolioId
            ? idAs<"portfolios">(input.sourcePortfolioId)
            : undefined,
          sourceAccountId: input.sourceAccountId ? idAs<"assets">(input.sourceAccountId) : undefined,
          notes: input.notes
        },
        (payload) => mutations.addPodExpense(payload as any),
        { id: undefined, replayed: false },
        // Batch flows pass a stable per-entry id so a retried batch replays
        // into mutation receipts instead of duplicating committed entries.
        input.clientMutationId
      );
    }

    // Strip the idempotency key before the local reducer — PodExpense has no
    // such field and the local path has no receipts to replay against.
    const localInput = { ...input };
    delete localInput.clientMutationId;
    const expense: PodExpense = { ...localInput, id: input.id ?? newId("pe") };
    dispatch({ type: "addPodExpense", expense });
    return { id: expense.id, clientMutationId: undefined, replayed: false };
  }

  async function updatePodExpense(
    expense: Pick<PodExpense, "id" | "podId">,
    patch: Partial<PodExpense>
  ) {
    if (isCloudPod(expense.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.updateExpense",
        {
        expenseId: idAs<"podExpenses">(expense.id),
        paidByMemberId: patch.paidByMemberId
          ? idAs<"podMembers">(patch.paidByMemberId)
          : undefined,
        paidByCard: hasOwn(patch, "paidByCard") ? patch.paidByCard ?? null : undefined,
        amount: patch.amount,
        currency: patch.currency ? asCloudCurrency(patch.currency) : undefined,
        description: patch.description,
        categoryId: hasOwn(patch, "categoryId")
          ? patch.categoryId
            ? idAs<"categories">(patch.categoryId)
            : null
          : undefined,
        occurredAt: patch.occurredAt,
        splitMode: patch.splitMode as PodSplitMode | undefined,
        participantMemberIds: patch.participantMemberIds?.map((id) => idAs<"podMembers">(id)),
        customSplits: hasOwn(patch, "customSplits")
          ? patch.customSplits?.map((split) => ({
              memberId: idAs<"podMembers">(split.memberId),
              bps: split.bps
            })) ?? null
          : undefined,
        coveredGroupId: hasOwn(patch, "coveredGroupId")
          ? patch.coveredGroupId
            ? idAs<"podGroups">(patch.coveredGroupId)
            : null
          : undefined,
        sourcePortfolioId: hasOwn(patch, "sourcePortfolioId")
          ? patch.sourcePortfolioId
            ? idAs<"portfolios">(patch.sourcePortfolioId)
            : null
          : undefined,
        sourceAccountId: hasOwn(patch, "sourceAccountId")
          ? patch.sourceAccountId
            ? idAs<"assets">(patch.sourceAccountId)
            : null
          : undefined,
        notes: hasOwn(patch, "notes") ? patch.notes ?? null : undefined
        },
        (payload) => mutations.updatePodExpense(payload as any),
        { id: expense.id, replayed: false }
      );
    }
    dispatch({ type: "updatePodExpense", id: expense.id, patch });
    return { id: expense.id, clientMutationId: undefined, replayed: false };
  }

  async function deletePodExpense(expense: Pick<PodExpense, "id" | "podId">) {
    if (isCloudPod(expense.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.removeExpense",
        {
        expenseId: idAs<"podExpenses">(expense.id)
        },
        (payload) => mutations.removePodExpense(payload as any),
        { id: expense.id, replayed: false }
      );
    }
    dispatch({ type: "deletePodExpense", id: expense.id });
    return { id: expense.id, clientMutationId: undefined, replayed: false };
  }

  async function addPodSettlement(input: AddPodSettlementInput) {
    assertDistinctSettlementMembers(input.fromMemberId, input.toMemberId);
    if (isCloudPod(input.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.addSettlement",
        {
          podId: idAs<"moneyPods">(input.podId),
          fromMemberId: idAs<"podMembers">(input.fromMemberId),
          toMemberId: idAs<"podMembers">(input.toMemberId),
          amount: input.amount,
          currency: asCloudCurrency(input.currency),
          occurredAt: input.occurredAt,
          note: input.note
        },
        (payload) => mutations.addPodSettlement(payload as any),
        { id: undefined, replayed: false }
      );
    }
    const settlement: PodSettlement = { ...input, id: input.id ?? newId("ps") };
    dispatch({ type: "addPodSettlement", settlement });
    return { id: settlement.id, clientMutationId: undefined, replayed: false };
  }

  async function deletePodSettlement(settlement: Pick<PodSettlement, "id" | "podId">) {
    if (isCloudPod(settlement.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.removeSettlement",
        {
        settlementId: idAs<"podSettlements">(settlement.id)
        },
        (payload) => mutations.removePodSettlement(payload as any),
        { id: settlement.id, replayed: false }
      );
    }
    dispatch({ type: "deletePodSettlement", id: settlement.id });
    return { id: settlement.id, clientMutationId: undefined, replayed: false };
  }

  async function updatePodSettlement(
    settlement: Pick<PodSettlement, "id" | "podId" | "fromMemberId" | "toMemberId">,
    patch: UpdatePodSettlementPatch
  ) {
    assertDistinctSettlementMembers(
      patch.fromMemberId ?? settlement.fromMemberId,
      patch.toMemberId ?? settlement.toMemberId
    );
    if (isCloudPod(settlement.podId)) {
      return await runQueuedCloudMutation(
        "moneyPods.updateSettlement",
        {
        settlementId: idAs<"podSettlements">(settlement.id),
        fromMemberId: hasOwn(patch, "fromMemberId")
          ? idAs<"podMembers">(patch.fromMemberId!)
          : undefined,
        toMemberId: hasOwn(patch, "toMemberId")
          ? idAs<"podMembers">(patch.toMemberId!)
          : undefined,
        amount: hasOwn(patch, "amount") ? patch.amount : undefined,
        currency: hasOwn(patch, "currency") && patch.currency
          ? asCloudCurrency(patch.currency)
          : undefined,
        occurredAt: hasOwn(patch, "occurredAt") ? patch.occurredAt : undefined,
        note: hasOwn(patch, "note") ? patch.note ?? null : undefined
        },
        (payload) => mutations.updatePodSettlement(payload as any),
        { id: settlement.id, replayed: false }
      );
    }
    dispatch({ type: "updatePodSettlement", id: settlement.id, patch });
    return { id: settlement.id, clientMutationId: undefined, replayed: false };
  }

  /**
   * Invite links are cloud-only, interactive owner actions (a local-only pod
   * has no server to redeem a code against), so they call Convex directly —
   * same posture as createMoneyPod.
   */
  async function createPodInviteCode(podId: string): Promise<{ code: string; expiresAt: number }> {
    if (!cloud.enabled || !cloudPodIds.has(podId)) {
      throw new Error("Invite links need a cloud pot.");
    }
    return await mutations.createPodInviteCode({ podId: idAs<"moneyPods">(podId) });
  }

  async function revokePodInviteCodes(podId: string): Promise<{ revoked: number }> {
    if (!cloud.enabled || !cloudPodIds.has(podId)) {
      throw new Error("Invite links need a cloud pot.");
    }
    return await mutations.revokePodInviteCodes({ podId: idAs<"moneyPods">(podId) });
  }

  async function joinPodByCode(
    code: string
  ): Promise<{ podId: string; memberId: string; alreadyMember: boolean }> {
    if (!cloud.enabled) {
      throw new Error("Joining by link needs a cloud account.");
    }
    const result = await mutations.joinPodByCode({ code });
    return {
      podId: String(result.podId),
      memberId: String(result.memberId),
      alreadyMember: result.alreadyMember
    };
  }

  return {
    createMoneyPod,
    updateMoneyPod,
    deleteMoneyPod,
    leaveMoneyPod,
    createPodInviteCode,
    revokePodInviteCodes,
    joinPodByCode,
    addPodMember,
    updatePodMember,
    deletePodMember,
    addPodGroup,
    updatePodGroup,
    deletePodGroup,
    addPodExpense,
    updatePodExpense,
    deletePodExpense,
    addPodSettlement,
    updatePodSettlement,
    deletePodSettlement
  };
}
