import { ConvexError, v } from "convex/values";
import { seedStarterCategories } from "./lib/starterCategories";
import { avatarDataURL } from "./lib/avatarImage";
import { normalizeClientMutationId, withMutationReceipt } from "./lib/mutationReceipts";
import { auth } from "./auth";
import { requireUser } from "./lib/access";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Minimal authenticated-viewer probe for the Vercel edge functions: returns
 * the signed-in user id or null without the profile/avatar/storage work that
 * `me` does. The paid AI/OCR routes call this to require a real user before
 * spending and to meter per user instead of per spoofable request fingerprint.
 */
export const viewerId = query({
  args: {},
  handler: async (ctx) => {
    try { return String(await requireUser(ctx)); } catch { return null; }
  }
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const avatar = await ctx.db.query("profileAvatars").withIndex("by_user", q => q.eq("userId", userId)).unique();
    const avatarUrl = avatar ? avatarDataURL(avatar.image) : profile?.avatarStorageId
      ? await ctx.storage.getUrl(profile.avatarStorageId)
      : null;
    return {
      id: userId,
      email: (user as { email?: string }).email ?? null,
      name: (user as { name?: string }).name ?? null,
      displayName: profile?.displayName ?? (user as { name?: string }).name ?? "",
      defaultCurrency: profile?.defaultCurrency ?? "EUR",
      theme: profile?.theme ?? "auto",
      locale: profile?.locale ?? null,
      // Missing appMode means a row written before the feature shipped — those
      // are pre-existing users; surface "advanced" so their UI doesn't suddenly
      // collapse. Fresh profiles created post-feature default to "light" (see
      // ensureProfile below).
      appMode: profile?.appMode ?? "advanced",
      // Missing themeKey → Citrus, the current brand default (AGENTS.md).
      // This also covers the fresh-signup window where the profile row exists
      // before ensureProfile writes themeKey — falling back to the legacy
      // "numa" purple here made onboarding flash off-brand. Users who
      // explicitly chose Classic have themeKey="numa" stored and keep it.
      themeKey: profile?.themeKey ?? "citrus",
      primaryJob: profile?.primaryJob ?? null,
      starterTemplate: profile?.starterTemplate ?? null,
      hasProfile: Boolean(profile),
      onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
      // Non-null while a 7-day deletion grace window is pending (epoch ms of
      // the scheduled erase). Drives the DeletionScheduledBanner cancel UI.
      deletionScheduledAt: profile?.deletionScheduledAt ?? null,
      // Once set, destructive chunks have begun and cancellation must fail
      // closed rather than promising recovery of partially erased data.
      deletionStartedAt: profile?.deletionStartedAt ?? null,
      avatarUrl,
      createdAt: profile?.createdAt ?? user._creationTime
    };
  }
});

const themeKeyValidator = v.union(
  v.literal("numa"),
  v.literal("citrus"),
  v.literal("pebble"),
  v.literal("coral"),
  v.literal("carbon")
);

const primaryJobValidator = v.union(
  v.literal("net_worth"),
  v.literal("daily_spending"),
  v.literal("shared_money")
);

const starterTemplateValidator = v.union(
  v.literal("personal_capital"),
  v.literal("couple_family"),
  v.literal("trip_shared_flat")
);

async function ensureStarterPortfolio(
  ctx: MutationCtx,
  userId: Id<"users">,
  displayName: string,
  defaultCurrency: "USD" | "EUR"
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (memberships.length > 0) return;

  // Server-side idempotency, second line of defence: even when the caller
  // has no membership rows, never mint a second starter if they already OWN
  // a portfolio. A membership can go missing relative to its portfolio (a
  // partial historical provisioning, a future bulk operation, an admin
  // repair) and the membership check alone would then happily create a
  // duplicate "Personal". Instead, relink the owner membership on the
  // existing portfolio and bail — repeated calls stay no-ops.
  const owned = await ctx.db
    .query("portfolios")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
  if (owned) {
    await ctx.db.insert("memberships", {
      portfolioId: owned._id,
      userId,
      ownershipBps: 10000,
      role: "owner",
      displayName,
      joinedAt: Date.now()
    });
    return;
  }

  const now = Date.now();
  const portfolioId = await ctx.db.insert("portfolios", {
    name: "Personal",
    type: "personal",
    tagline: "Just you",
    ownerId: userId,
    defaultCurrency,
    createdAt: now
  });
  await ctx.db.insert("memberships", {
    portfolioId,
    userId,
    ownershipBps: 10000,
    role: "owner",
    displayName,
    joinedAt: now
  });
  await seedStarterCategories(ctx, portfolioId);
  await ctx.db.insert("assets", {
    portfolioId,
    name: "Cash",
    kind: "cash",
    balance: 0,
    currency: defaultCurrency,
    notes: "Starter account — every transaction debits/credits its balance",
    updatedAt: now
  });
}

export const ensureProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    defaultCurrency: v.optional(v.union(v.literal("USD"), v.literal("EUR"))),
    appMode: v.optional(v.union(v.literal("light"), v.literal("advanced"), v.literal("shared"))),
    themeKey: v.optional(themeKeyValidator),
    primaryJob: v.optional(primaryJobValidator),
    starterTemplate: v.optional(starterTemplateValidator),
    onboardingCompletedAt: v.optional(v.number()),
    locale: v.optional(v.union(v.literal("en"), v.literal("ru"), v.literal("es")))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      if (args.onboardingCompletedAt !== undefined && !existing.onboardingCompletedAt) {
        if (!Number.isFinite(args.onboardingCompletedAt) || args.onboardingCompletedAt <= 0) {
          throw new Error("Invalid onboarding completion time");
        }
        await ctx.db.patch(existing._id, { onboardingCompletedAt: args.onboardingCompletedAt });
      }
      await ensureStarterPortfolio(ctx, userId, existing.displayName, existing.defaultCurrency);
      return existing._id;
    }
    const user = await ctx.db.get(userId);
    const fallbackName =
      args.displayName?.trim() ||
      (user as { name?: string }).name ||
      ((user as { email?: string }).email ?? "").split("@")[0] ||
      "You";
    const defaultCurrency = args.defaultCurrency ?? "EUR";
    const profileId = await ctx.db.insert("profiles", {
      userId,
      displayName: fallbackName,
      defaultCurrency,
      theme: "auto",
      // Default to Light for fresh signups — newbies start simple and can
      // graduate to Advanced from Settings whenever they want more surface.
      appMode: args.appMode ?? "light",
      primaryJob: args.primaryJob ?? "daily_spending",
      starterTemplate: args.starterTemplate ?? "personal_capital",
      onboardingCompletedAt: args.onboardingCompletedAt,
      // Citrus is the design-recommended brand for new users.
      themeKey: args.themeKey ?? "citrus",
      locale: args.locale,
      createdAt: Date.now()
    });
    await ensureStarterPortfolio(ctx, userId, fallbackName, defaultCurrency);
    return profileId;
  }
});

export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    defaultCurrency: v.optional(v.union(v.literal("USD"), v.literal("EUR"))),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("auto"))),
    appMode: v.optional(v.union(v.literal("light"), v.literal("advanced"), v.literal("shared"))),
    themeKey: v.optional(themeKeyValidator),
    primaryJob: v.optional(primaryJobValidator),
    starterTemplate: v.optional(starterTemplateValidator),
    onboardingCompletedAt: v.optional(v.number()),
    locale: v.optional(v.union(v.literal("en"), v.literal("ru"), v.literal("es")))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("Profile not initialised yet");
    const patch: Record<string, unknown> = {};
    if (args.displayName !== undefined) {
      const displayName = args.displayName.trim();
      if (!displayName) throw new Error("Display name is required");
      patch.displayName = displayName;
    }
    if (args.defaultCurrency !== undefined) patch.defaultCurrency = args.defaultCurrency;
    if (args.theme !== undefined) patch.theme = args.theme;
    if (args.appMode !== undefined) patch.appMode = args.appMode;
    if (args.themeKey !== undefined) patch.themeKey = args.themeKey;
    if (args.primaryJob !== undefined) patch.primaryJob = args.primaryJob;
    if (args.starterTemplate !== undefined) patch.starterTemplate = args.starterTemplate;
    if (args.onboardingCompletedAt !== undefined) {
      if (!Number.isFinite(args.onboardingCompletedAt) || args.onboardingCompletedAt <= 0) {
        throw new Error("Invalid onboarding completion time");
      }
      patch.onboardingCompletedAt = args.onboardingCompletedAt;
    }
    if (args.locale !== undefined) patch.locale = args.locale;
    await ctx.db.patch(profile._id, patch);
    if (typeof patch.displayName === "string") {
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      await Promise.all(
        memberships.map((membership) =>
          ctx.db.patch(membership._id, { displayName: patch.displayName as string })
        )
      );
      const podMembers = await ctx.db
        .query("podMembers")
        .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
        .collect();
      await Promise.all(
        podMembers.map((member) =>
          ctx.db.patch(member._id, { displayName: patch.displayName as string })
        )
      );
    }
  }
});

// Old clients must update rather than mint unowned uploads or assign another
// user's storage ID. Keep callable names so they fail closed with a clear error.
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    throw new ConvexError({ code: "CLIENT_UPDATE_REQUIRED", message: "Reload Numa Pro to use secure profile-photo uploads." });
  }
});
export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async ctx => {
    await requireUser(ctx);
    throw new ConvexError({ code: "CLIENT_UPDATE_REQUIRED", message: "Reload Numa Pro to use secure profile-photo uploads." });
  }
});
export const clearAvatar = mutation({
  args: { expectedUserId: v.id("users"), clientMutationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (userId !== args.expectedUserId) throw new ConvexError({ code: "ACCOUNT_CHANGED", message: "Remove the photo in the current account." });
    const receipt = normalizeClientMutationId(args.clientMutationId);
    if (!receipt) throw new ConvexError({ code: "INVALID_INPUT", message: "A stable photo-change identifier is required." });
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (!profile) throw new ConvexError({ code: "PROFILE_REQUIRED", message: "Open Settings before changing your photo." });
    return withMutationReceipt(ctx, userId, receipt, "profiles.clearAvatar", async () => {
      const avatar = await ctx.db.query("profileAvatars").withIndex("by_user", q => q.eq("userId", userId)).unique();
      if (avatar) await ctx.db.delete(avatar._id);
      // Unlink ambiguous legacy storage; never delete someone else's file.
      await ctx.db.patch(profile._id, { avatarStorageId: undefined });
      return profile._id;
    }, String(userId));
  }
});
