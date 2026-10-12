import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/access";
import { normalizeClientMutationId, withMutationReceipt } from "./lib/mutationReceipts";
import { avatarDigest, normalizeAvatarPNG } from "./lib/avatarImage";

/** One small owner-bound document, not an orphanable file-storage upload.
 * Bytes, owner association and receipt commit/roll back in one transaction. */
export const setImage = mutation({
  args: { expectedUserId: v.id("users"), image: v.bytes(), clientMutationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (userId !== args.expectedUserId) throw new ConvexError({ code: "ACCOUNT_CHANGED", message: "Choose the photo again in the current account." });
    const receipt = normalizeClientMutationId(args.clientMutationId);
    if (!receipt) throw new ConvexError({ code: "INVALID_INPUT", message: "A stable photo-change identifier is required." });
    const profile = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (!profile) throw new ConvexError({ code: "PROFILE_REQUIRED", message: "Open Settings before changing your photo." });
    const image = normalizeAvatarPNG(args.image);
    const digest = await avatarDigest(image);
    return withMutationReceipt(ctx, userId, receipt, "profileAvatars.setImage", async () => {
      const existing = await ctx.db.query("profileAvatars").withIndex("by_user", q => q.eq("userId", userId)).unique();
      const fields = { userId, image, updatedAt: Date.now() };
      const id = existing ? existing._id : await ctx.db.insert("profileAvatars", fields);
      if (existing) await ctx.db.patch(id, fields);
      // Legacy IDs were not bound to their uploader. Never delete a file on
      // the strength of an old profile pointer; ownership audit is separate.
      await ctx.db.patch(profile._id, { avatarStorageId: undefined });
      return id;
    }, digest);
  },
});
