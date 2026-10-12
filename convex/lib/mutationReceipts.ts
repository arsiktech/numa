import { ConvexError } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export interface ReceiptResult<T extends TableNames> {
  id: Id<T>;
  clientMutationId?: string;
  replayed: boolean;
}

export function normalizeClientMutationId(clientMutationId: string | undefined) {
  const trimmed = clientMutationId?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 200) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "clientMutationId is too long"
    });
  }
  return trimmed;
}

export async function withMutationReceipt<T extends TableNames>(
  ctx: MutationCtx,
  userId: Id<"users">,
  clientMutationId: string | undefined,
  operation: string,
  run: () => Promise<Id<T>>,
  scopeId?: string
): Promise<ReceiptResult<T>> {
  const normalized = normalizeClientMutationId(clientMutationId);
  if (!normalized) {
    return { id: await run(), replayed: false };
  }

  const existing = await ctx.db
    .query("mutationReceipts")
    .withIndex("by_client_mutation", (q) => q.eq("clientMutationId", normalized))
    .unique();
  if (existing) {
    if (String(existing.userId) !== String(userId) || existing.operation !== operation ||
        (scopeId !== undefined && existing.scopeId !== undefined && existing.scopeId !== scopeId)) {
      throw new ConvexError({
        code: "DUPLICATE_CLIENT_MUTATION_ID",
        message: "clientMutationId was already used for a different mutation"
      });
    }
    // Pre-scope receipts remain replayable. A surviving result proves scope;
    // a deleted result can only acknowledge the original actor's old operation,
    // never execute again or acquire an invented scope from the retry payload.
    if (scopeId !== undefined && existing.scopeId === undefined) {
      const result = await ctx.db.get(existing.resultId as Id<T>);
      if (result && (!("portfolioId" in result) || String(result.portfolioId) !== scopeId)) {
        throw new ConvexError({ code: "DUPLICATE_CLIENT_MUTATION_ID", message: "Receipt result belongs to a different portfolio" });
      }
    }
    await ctx.db.patch(existing._id, { updatedAt: Date.now() });
    return {
      id: existing.resultId as Id<T>,
      clientMutationId: normalized,
      replayed: true
    };
  }

  const id = await run();
  const now = Date.now();
  await ctx.db.insert("mutationReceipts", {
    clientMutationId: normalized,
    operation,
    userId,
    resultId: String(id),
    scopeId,
    createdAt: now,
    updatedAt: now
  });
  return { id, clientMutationId: normalized, replayed: false };
}
