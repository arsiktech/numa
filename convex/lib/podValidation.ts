import { ConvexError } from "convex/values";
import type { AnyCtx } from "./access";
import type { Doc, Id } from "../_generated/dataModel";
import { assertPositiveAmount, cleanRequired } from "./inputGuards";

/**
 * Pod reference + expense-input validation shared by the web surface
 * (moneyPods.ts) and the mobile surface (mobile.ts). Both previously carried
 * near-identical copies of the member/group guards and the ~90-line expense
 * validation; drift between the two is exactly the kind of thing that makes
 * the mobile client accept input the web rejects.
 */

export async function requirePodMember(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  memberId: Id<"podMembers">
): Promise<Doc<"podMembers">> {
  const member = await ctx.db.get(memberId);
  if (!member) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Pod member not found" });
  }
  if (String(member.podId) !== String(podId)) {
    throw new ConvexError({
      code: "INVALID_REFERENCE",
      message: "Pod member does not belong to this money pod"
    });
  }
  return member;
}

export async function requirePodGroup(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  groupId: Id<"podGroups">
): Promise<Doc<"podGroups">> {
  const group = await ctx.db.get(groupId);
  if (!group) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Pod group not found" });
  }
  if (String(group.podId) !== String(podId)) {
    throw new ConvexError({
      code: "INVALID_REFERENCE",
      message: "Pod group does not belong to this money pod"
    });
  }
  return group;
}

export async function validatePodGroup(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  groupId: Id<"podGroups"> | null | undefined
) {
  if (!groupId) return;
  await requirePodGroup(ctx, podId, groupId);
}

export interface PodExpenseInput {
  paidByMemberId: Id<"podMembers">;
  amount: number;
  description: string;
  participantMemberIds: Id<"podMembers">[];
  customSplits?: { memberId: Id<"podMembers">; bps: number }[];
  coveredGroupId?: Id<"podGroups">;
  splitMode: "equal_people" | "equal_groups" | "custom" | "covered_group";
}

function invalid(message: string): ConvexError<{ code: "INVALID_INPUT"; message: string }> {
  return new ConvexError({ code: "INVALID_INPUT", message });
}

/**
 * Full validation of a pod expense payload. Throws ConvexError on the first
 * problem; callers translate nothing — the messages are user-facing already.
 */
export async function validatePodExpenseInput(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  input: PodExpenseInput
) {
  assertPositiveAmount(input.amount);
  cleanRequired(input.description, "Description");
  await requirePodMember(ctx, podId, input.paidByMemberId);

  const uniqueParticipants = new Set(input.participantMemberIds.map(String));
  if (uniqueParticipants.size === 0) {
    throw invalid("Expense must have at least one participant");
  }
  const participantMembers = [];
  for (const memberId of input.participantMemberIds) {
    participantMembers.push(await requirePodMember(ctx, podId, memberId));
  }
  if (uniqueParticipants.size !== input.participantMemberIds.length) {
    throw invalid("Expense participants must be unique");
  }

  if (input.splitMode === "custom") {
    const splits = input.customSplits ?? [];
    if (splits.length === 0) {
      throw invalid("Custom split expenses must define shares");
    }
    const seenSplitMembers = new Set<string>();
    const totalBps = splits.reduce((sum, split) => sum + split.bps, 0);
    for (const split of splits) {
      if (!Number.isFinite(split.bps) || !Number.isInteger(split.bps) || split.bps < 0) {
        throw invalid("Custom split basis points must be non-negative integers");
      }
      const splitMemberId = String(split.memberId);
      if (!uniqueParticipants.has(splitMemberId)) {
        throw invalid("Custom split members must be selected participants");
      }
      if (seenSplitMembers.has(splitMemberId)) {
        throw invalid("Custom split members must be unique");
      }
      seenSplitMembers.add(splitMemberId);
      await requirePodMember(ctx, podId, split.memberId);
    }
    if (totalBps !== 10000) {
      throw invalid("Custom split basis points must total 10000");
    }
  }

  if (input.splitMode === "covered_group" && !input.coveredGroupId) {
    throw invalid("Covered group expenses must choose a group");
  }
  await validatePodGroup(ctx, podId, input.coveredGroupId);

  if (input.splitMode === "covered_group" && input.coveredGroupId) {
    const hasCoveredParticipant = participantMembers.some(
      (member) => String(member.groupId) === String(input.coveredGroupId)
    );
    const hasOutsideParticipant = participantMembers.some(
      (member) => String(member.groupId) !== String(input.coveredGroupId)
    );
    if (!hasCoveredParticipant || hasOutsideParticipant) {
      throw invalid("Covered group participants must belong to the covered group");
    }
  }
}
