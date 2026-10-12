import { ConvexError, v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount
} from "@convex-dev/auth/server";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { validatePasswordPolicy } from "./lib/passwordPolicy";

declare const process: {
  env: Record<string, string | undefined>;
};

export const methods = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    }
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const providers = new Set(accounts.map((account) => account.provider));
    return {
      hasPassword: providers.has("password"),
      hasGoogle: providers.has("google"),
      hasApple: providers.has("apple"),
      googleAvailable: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
      appleAvailable: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)
    };
  }
});

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    }
    const currentSessionId = await getAuthSessionId(ctx);
    const now = Date.now();
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    return sessions
      .filter((session) => session.expirationTime > now)
      .map((session) => ({
        id: session._id,
        createdAt: session._creationTime,
        expiresAt: session.expirationTime,
        isCurrent: session._id === currentSessionId
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
});

export const signOutOtherSessions = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    }
    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, {
      userId,
      except: sessionId ? [sessionId] : []
    });
    return { ok: true };
  }
});

export const passwordAccountForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", args.userId).eq("provider", "password")
      )
      .unique();
    return account
      ? {
          userId: account.userId,
          providerAccountId: account.providerAccountId,
          email: user?.email,
          displayName: user?.name
        }
      : null;
  }
});

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    }
    if (args.currentPassword === args.newPassword) {
      throw new ConvexError({
        code: "SAME_PASSWORD",
        message: "New password must be different."
      });
    }

    const account = await ctx.runQuery(internal.authManagement.passwordAccountForUser, {
      userId
    });
    if (!account) {
      throw new ConvexError({
        code: "PASSWORD_NOT_AVAILABLE",
        message: "This account does not have password sign-in enabled."
      });
    }
    const passwordPolicy = validatePasswordPolicy(args.newPassword, {
      email: account.email,
      displayName: account.displayName
    });
    if (!passwordPolicy.ok) {
      throw new ConvexError({
        code: "WEAK_PASSWORD",
        message: passwordPolicy.issues[0]?.message ?? "Password is too weak."
      });
    }

    try {
      const retrieved = await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: account.providerAccountId,
          secret: args.currentPassword
        }
      });
      if (retrieved.account.userId !== userId) {
        throw new Error("Wrong account");
      }
    } catch {
      throw new ConvexError({
        code: "INVALID_CURRENT_PASSWORD",
        message: "Current password is incorrect."
      });
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: account.providerAccountId,
        secret: args.newPassword
      }
    });

    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, {
      userId,
      except: sessionId ? [sessionId] : []
    });

    return { ok: true };
  }
});
