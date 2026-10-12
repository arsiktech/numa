import { ConvexError } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ReceiptResult } from "./mutationReceipts";

type AuditedActionType =
  | "transaction.create"
  | "category.create"
  | "budget.update"
  | "goal.upsert";

function canonicalPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalPayload(item)])
    );
  }
  return value;
}

export function auditedPayloadMatches(
  proposedPayload: unknown,
  actualPayload: Record<string, unknown>,
  payloadKeys: readonly string[]
) {
  if (!proposedPayload || typeof proposedPayload !== "object" || Array.isArray(proposedPayload)) {
    return false;
  }
  const proposed = proposedPayload as Record<string, unknown>;
  const expected = Object.fromEntries(payloadKeys.map((key) => [key, proposed[key]]));
  const actual = Object.fromEntries(payloadKeys.map((key) => [key, actualPayload[key]]));
  return JSON.stringify(canonicalPayload(expected)) === JSON.stringify(canonicalPayload(actual));
}

export async function withAiAuditConfirmation<T extends TableNames>(
  ctx: MutationCtx,
  input: {
    userId: Id<"users">;
    portfolioId: Id<"portfolios">;
    auditDraftId?: Id<"aiActionDrafts">;
    clientMutationId?: string;
    actionType: AuditedActionType;
    actualPayload: Record<string, unknown>;
    payloadKeys: readonly string[];
  },
  run: () => Promise<ReceiptResult<T>>
) {
  if (!input.auditDraftId) return await run();
  const confirmedMutationId = input.clientMutationId?.trim();
  if (!confirmedMutationId) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Audited writes require a clientMutationId"
    });
  }

  const draft = await ctx.db.get(input.auditDraftId);
  if (!draft) {
    throw new ConvexError({ code: "NOT_FOUND", message: "AI action draft not found" });
  }
  if (String(draft.userId) !== String(input.userId)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Draft belongs to another user" });
  }
  if (
    draft.actionType !== input.actionType ||
    String(draft.portfolioId ?? "") !== String(input.portfolioId)
  ) {
    throw new ConvexError({
      code: "INVALID_DRAFT",
      message: "AI action draft does not match this write"
    });
  }
  if (!auditedPayloadMatches(
    draft.proposedPayload,
    input.actualPayload,
    input.payloadKeys
  )) {
    throw new ConvexError({
      code: "AUDIT_PAYLOAD_MISMATCH",
      message: "AI action draft payload does not match this write"
    });
  }
  const isSameReplay =
    draft.status === "confirmed" &&
    draft.confirmedMutationId === confirmedMutationId;
  if (draft.status !== "draft" && !isSameReplay) {
    throw new ConvexError({
      code: "INVALID_STATE",
      message: "Draft is no longer pending"
    });
  }

  const result = await run();
  if (isSameReplay) {
    if (draft.resultId && draft.resultId !== String(result.id)) {
      throw new ConvexError({
        code: "AUDIT_RESULT_MISMATCH",
        message: "Draft result does not match the mutation receipt"
      });
    }
    return result;
  }

  const now = Date.now();
  await ctx.db.patch(input.auditDraftId, {
    status: "confirmed",
    confirmedMutationId,
    resultId: String(result.id),
    error: undefined,
    updatedAt: now,
    confirmedAt: now
  });
  return result;
}
