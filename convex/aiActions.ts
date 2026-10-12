import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMember, requireUser } from "./lib/access";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { auditedPayloadMatches } from "./lib/aiAudit";

const actionTypeValidator = v.union(
  v.literal("transaction.create"),
  v.literal("category.create"),
  v.literal("budget.update"),
  v.literal("podExpense.create"),
  v.literal("settlement.create"),
  v.literal("goal.upsert"),
  v.literal("recurring.create")
);

export function shouldMarkAiActionFailed(status: string) {
  return status === "draft";
}

export function normalizeAiRedraftRequestId(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "retryRequestId must be between 1 and 200 characters"
    });
  }
  return normalized;
}

export function normalizeAiDraftCreateRequestId(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "createRequestId must be between 1 and 200 characters"
    });
  }
  return normalized;
}

function createPayloadMatches(existing: unknown, proposed: unknown) {
  if (
    existing && proposed &&
    typeof existing === "object" && !Array.isArray(existing) &&
    typeof proposed === "object" && !Array.isArray(proposed)
  ) {
    const keys = [...new Set([
      ...Object.keys(existing as Record<string, unknown>),
      ...Object.keys(proposed as Record<string, unknown>)
    ])];
    return auditedPayloadMatches(
      existing,
      proposed as Record<string, unknown>,
      keys
    );
  }
  return JSON.stringify(existing) === JSON.stringify(proposed);
}

export async function createAiActionDraft(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    portfolioId?: Id<"portfolios">;
    podId?: Id<"moneyPods">;
    actionType:
      | "transaction.create"
      | "category.create"
      | "budget.update"
      | "podExpense.create"
      | "settlement.create"
      | "goal.upsert"
      | "recurring.create";
    prompt: string;
    proposedPayload: unknown;
    createRequestId?: string;
  }
) {
  const createRequestId = args.createRequestId === undefined
    ? undefined
    : normalizeAiDraftCreateRequestId(args.createRequestId);
  const prompt = args.prompt.trim().slice(0, 4_000);
  if (!prompt) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Draft prompt is required" });
  }
  const existing = createRequestId
    ? await ctx.db
      .query("aiActionDrafts")
      .withIndex("by_user_create_request", (q) =>
        q.eq("userId", userId).eq("createRequestId", createRequestId)
      )
      .unique()
    : null;
  if (existing && createRequestId) {
    const sameIntent =
      existing.actionType === args.actionType &&
      String(existing.portfolioId ?? "") === String(args.portfolioId ?? "") &&
      String(existing.podId ?? "") === String(args.podId ?? "") &&
      existing.prompt === prompt &&
      createPayloadMatches(existing.proposedPayload, args.proposedPayload);
    if (!sameIntent) {
      throw new ConvexError({
        code: "DUPLICATE_CREATE_REQUEST_ID",
        message: "createRequestId was already used for another reviewed action"
      });
    }
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("aiActionDrafts", {
    userId,
    portfolioId: args.portfolioId,
    podId: args.podId,
    actionType: args.actionType,
    status: "draft",
    prompt,
    proposedPayload: args.proposedPayload,
    ...(createRequestId ? { createRequestId } : null),
    createdAt: now,
    updatedAt: now
  });
}

export function rejectStandaloneAiActionConfirmation(): never {
  throw new ConvexError({
    code: "ATOMIC_CONFIRM_REQUIRED",
    message: "Confirm this draft through its audited financial mutation"
  });
}

export const listMine = query({
  args: {
    portfolioId: v.optional(v.id("portfolios")),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("confirmed"),
        v.literal("cancelled"),
        v.literal("failed")
      )
    )
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.portfolioId) {
      await requireMember(ctx, args.portfolioId);
    }
    const rows = await ctx.db
      .query("aiActionDrafts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((row) => !args.portfolioId || String(row.portfolioId) === String(args.portfolioId))
      .filter((row) => !args.status || row.status === args.status)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
});

export const createDraft = mutation({
  args: {
    portfolioId: v.optional(v.id("portfolios")),
    podId: v.optional(v.id("moneyPods")),
    actionType: actionTypeValidator,
    prompt: v.string(),
    proposedPayload: v.any(),
    // Optional for already-installed native/PWA clients. New clients always
    // provide it; legacy callers retain the old one-insert-per-call behavior.
    createRequestId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.portfolioId) {
      await requireMember(ctx, args.portfolioId);
    }
    return await createAiActionDraft(ctx, userId, args);
  }
});

export async function updatePendingAiActionProposal(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    id: Id<"aiActionDrafts">;
    prompt: string;
    proposedPayload: unknown;
  }
) {
  const draft = await ctx.db.get(args.id);
  if (!draft) {
    throw new ConvexError({ code: "NOT_FOUND", message: "AI action draft not found" });
  }
  if (String(draft.userId) !== String(userId)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Draft belongs to another user" });
  }
  if (
    !args.proposedPayload ||
    typeof args.proposedPayload !== "object" ||
    Array.isArray(args.proposedPayload)
  ) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Draft payload must be an object" });
  }
  const prompt = args.prompt.trim();
  if (!prompt) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Draft prompt is required" });
  }

  if (draft.status === "confirmed") {
    const current = draft.proposedPayload && typeof draft.proposedPayload === "object"
      ? draft.proposedPayload as Record<string, unknown>
      : {};
    const next = args.proposedPayload as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(current), ...Object.keys(next)])];
    if (!auditedPayloadMatches(current, next, keys)) {
      throw new ConvexError({
        code: "AUDIT_PAYLOAD_MISMATCH",
        message: "Confirmed draft does not match this transaction"
      });
    }
    return { id: args.id, status: draft.status, resultId: draft.resultId };
  }
  if (draft.status === "failed") {
    return { id: args.id, status: draft.status };
  }
  if (draft.status !== "draft") {
    throw new ConvexError({
      code: "INVALID_STATE",
      message: "Only a pending AI action can be updated"
    });
  }

  await ctx.db.patch(args.id, {
    prompt: prompt.slice(0, 4_000),
    proposedPayload: args.proposedPayload,
    updatedAt: Date.now()
  });
  return { id: args.id, status: "draft" as const };
}

export const updateDraftProposal = mutation({
  args: {
    id: v.id("aiActionDrafts"),
    prompt: v.string(),
    proposedPayload: v.any()
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await updatePendingAiActionProposal(ctx, userId, args);
  }
});

export const confirmDraft = mutation({
  args: {
    id: v.id("aiActionDrafts"),
    confirmedMutationId: v.string(),
    resultId: v.optional(v.string())
  },
  handler: async (ctx) => {
    await requireUser(ctx);
    return rejectStandaloneAiActionConfirmation();
  }
});

export const cancelDraft = mutation({
  args: { id: v.id("aiActionDrafts") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const draft = await ctx.db.get(args.id);
    if (!draft) return;
    if (String(draft.userId) !== String(userId)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Draft belongs to another user" });
    }
    if (draft.status !== "draft") return args.id;
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: now,
      cancelledAt: now
    });
    return args.id;
  }
});

export const markFailed = mutation({
  args: {
    id: v.id("aiActionDrafts"),
    error: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const draft = await ctx.db.get(args.id);
    if (!draft) return null;
    if (String(draft.userId) !== String(userId)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Draft belongs to another user" });
    }
    if (draft.status === "confirmed") {
      return { id: args.id, status: draft.status, resultId: draft.resultId };
    }
    if (shouldMarkAiActionFailed(draft.status)) {
      await ctx.db.patch(args.id, {
        status: "failed",
        error: args.error.slice(0, 500),
        updatedAt: Date.now()
      });
      return { id: args.id, status: "failed" as const, resultId: undefined };
    }
    return { id: args.id, status: draft.status, resultId: draft.resultId };
  }
});

export async function redraftFailedAiAction(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { id: Id<"aiActionDrafts">; retryRequestId: string }
) {
    const draft = await ctx.db.get(args.id);
    if (!draft) {
      throw new ConvexError({ code: "NOT_FOUND", message: "AI action draft not found" });
    }
    if (String(draft.userId) !== String(userId)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Draft belongs to another user" });
    }
    if (draft.status !== "failed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only a failed reviewed action can be redrafted"
      });
    }
    const retryRequestId = normalizeAiRedraftRequestId(args.retryRequestId);
    const existing = await ctx.db
      .query("aiActionDrafts")
      .withIndex("by_user_retry_request", (q) =>
        q.eq("userId", userId).eq("retryRequestId", retryRequestId)
      )
      .unique();
    if (existing) {
      if (String(existing.retryOfDraftId) !== String(args.id)) {
        throw new ConvexError({
          code: "DUPLICATE_RETRY_REQUEST_ID",
          message: "retryRequestId was already used for another reviewed action"
        });
      }
      return existing._id;
    }
    const now = Date.now();
    return await ctx.db.insert("aiActionDrafts", {
      userId,
      portfolioId: draft.portfolioId,
      podId: draft.podId,
      actionType: draft.actionType,
      status: "draft",
      prompt: draft.prompt,
      proposedPayload: draft.proposedPayload,
      retryOfDraftId: args.id,
      retryRequestId,
      createdAt: now,
      updatedAt: now
    });
}

export const redraftFailed = mutation({
  args: {
    id: v.id("aiActionDrafts"),
    retryRequestId: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await redraftFailedAiAction(ctx, userId, args);
  }
});
