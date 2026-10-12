import { assertTransactionMoney } from "./lib/transactionFinance";
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertExistingAccount, requireEditor, requireUser } from "./lib/access";

// Convex's bundled type lib doesn't include the Node `process` global. Mirror
// the pattern in pushSubscriptions.ts so this compiles cleanly.
declare const process: {
  env: Record<string, string | undefined>;
};

const TOKEN_PREFIX = "numa_wh_";

/**
 * Shared secret used by /api/webhooks/transaction to call
 * `validateAndConsume` from a Vercel function. We deliberately reuse the
 * existing NUMA_PUSH_INTERNAL_SECRET so ops stays simple — same gate, same
 * threat model (bearer-only, never seen by browsers).
 */
function assertInternalCaller(token: string | undefined): void {
  const expected = process.env.NUMA_PUSH_INTERNAL_SECRET ?? "";
  if (!expected) {
    throw new ConvexError({
      code: "MISCONFIGURED",
      message: "NUMA_PUSH_INTERNAL_SECRET is not set on the Convex deployment"
    });
  }
  if (!token || token !== expected) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Bad token" });
  }
}

/**
 * Hex-encode SHA-256 of `input` inside the Convex isolate using WebCrypto.
 * Same algorithm used by /api/webhooks/transaction so hashes match.
 */
async function sha256(input: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate 32 random bytes via WebCrypto and hex-encode them. */
function randomHex32(): string {
  const arr = new Uint8Array(32);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint a new webhook token for a portfolio the caller can edit. Returns both
 * the raw token (formatted as `numa_wh_<hex>`) and the row id — the raw
 * token must be shown to the user immediately and then forgotten by the
 * caller, because only its SHA-256 hash is persisted.
 */
export const createToken = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    label: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const trimmedLabel = args.label.trim();
    if (!trimmedLabel) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Label is required"
      });
    }
    if (trimmedLabel.length > 60) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Label is too long (max 60 chars)"
      });
    }
    const rawToken = `${TOKEN_PREFIX}${randomHex32()}`;
    const tokenHash = await sha256(rawToken);
    const id = await ctx.db.insert("webhookTokens", {
      userId,
      portfolioId: args.portfolioId,
      tokenHash,
      label: trimmedLabel,
      scope: "add-transaction",
      createdAt: Date.now(),
      uses: 0
    });
    return { id, token: rawToken };
  }
});

/**
 * Metadata-only listing for the current user's tokens. Never returns the
 * hash or anything that could be used to forge a token. Each row is joined
 * with its portfolio's display name for convenient UI rendering.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("webhookTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const results = await Promise.all(
      rows.map(async (row) => {
        const portfolio = await ctx.db.get(row.portfolioId);
        return {
          id: row._id,
          label: row.label,
          scope: row.scope,
          portfolioId: row.portfolioId,
          portfolioName: portfolio?.name ?? "Unknown portfolio",
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
          uses: row.uses
        };
      })
    );
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }
});

/**
 * Delete a token. Owner-only (the user who minted it). Silently no-ops on
 * missing rows so the UI can stay optimistic.
 */
export const revokeToken = mutation({
  args: { id: v.id("webhookTokens") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    if (existing.userId !== userId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Not your token"
      });
    }
    await ctx.db.delete(args.id);
  }
});

/**
 * Server-only validator called by /api/webhooks/transaction. Guarded by the
 * shared bearer secret — never callable from a browser. On hit, patches
 * `lastUsedAt` and increments `uses` atomically, then returns the owner +
 * portfolio so the function can authorize the downstream write. Kept around
 * for callers (e.g. future scopes) that need to validate without inserting.
 */
export const validateAndConsume = mutation({
  args: {
    tokenHash: v.string(),
    serverSecret: v.string()
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.serverSecret);
    const row = await ctx.db
      .query("webhookTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row) return null;
    await assertExistingAccount(ctx, row.userId);
    await ctx.db.patch(row._id, {
      lastUsedAt: Date.now(),
      uses: row.uses + 1
    });
    return {
      userId: row.userId,
      portfolioId: row.portfolioId,
      scope: row.scope
    };
  }
});

const txKindValidator = v.union(v.literal("income"), v.literal("expense"));
const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));

/**
 * Atomic "validate token + insert transaction" path used by the public
 * Vercel webhook endpoint. We don't expose `transactions.add` directly to
 * the function because that mutation pulls the userId from the auth
 * session, and the Vercel function has no end-user session — it has a
 * shared bearer secret + a token hash. Doing both steps in a single
 * mutation also makes the bump-counter / write side-effects atomic.
 *
 * Resolves `categoryName` to a `categoryId` by exact case-insensitive match
 * inside the token's portfolio; if none exists the transaction is inserted
 * with `categoryId` undefined.
 */
export const ingestTransaction = mutation({
  args: {
    tokenHash: v.string(),
    serverSecret: v.string(),
    occurredAt: v.number(),
    description: v.string(),
    kind: txKindValidator,
    amount: v.number(),
    currency: currencyValidator,
    categoryName: v.optional(v.string()),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.serverSecret);
    const row = await ctx.db
      .query("webhookTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row) return { ok: false as const, reason: "invalid_token" as const };
    await assertExistingAccount(ctx, row.userId);
    if (row.scope !== "add-transaction") {
      return { ok: false as const, reason: "wrong_scope" as const };
    }
    // Re-verify the issuing user still has editor+ access on this portfolio
    // — they may have been demoted or removed since minting the token.
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", row.userId))
      .filter((q) => q.eq(q.field("portfolioId"), row.portfolioId))
      .unique();
    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
      return { ok: false as const, reason: "access_revoked" as const };
    }
    assertTransactionMoney({ ...args, portfolioId: row.portfolioId });
    // Usage and the insert commit atomically.
    await ctx.db.patch(row._id, {
      lastUsedAt: Date.now(),
      uses: row.uses + 1
    });

    // Best-effort categoryName -> categoryId resolution. Case-insensitive,
    // filtered to the same `kind` so an "expense" tx can't grab an "income"
    // category accidentally. Missing match is fine — categoryId stays unset.
    let categoryId: Id<"categories"> | undefined;
    if (args.categoryName) {
      const want = args.categoryName.trim().toLowerCase();
      const candidates = await ctx.db
        .query("categories")
        .withIndex("by_portfolio", (q) => q.eq("portfolioId", row.portfolioId))
        .collect();
      const match = candidates.find(
        (c) => c.name.trim().toLowerCase() === want && c.kind === args.kind
      );
      if (match) categoryId = match._id;
    }

    const txId = await ctx.db.insert("transactions", {
      portfolioId: row.portfolioId,
      occurredAt: args.occurredAt,
      description: args.description,
      categoryId,
      kind: args.kind,
      amount: args.amount,
      currency: args.currency,
      createdByUserId: row.userId,
      notes: args.notes
    });

    return {
      ok: true as const,
      transactionId: txId,
      portfolioId: row.portfolioId,
      categoryResolved: categoryId !== undefined
    };
  }
});
