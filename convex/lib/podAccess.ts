import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireUser, type AnyCtx } from "./access";
import { activePodMembership, verifiedInvitationEmail } from "./invitationAuthority";

/**
 * Shared access-control + display helpers for moneyPods functions: argument
 * validators, member/editor/owner gates, currency pinning, and the two member
 * lookup helpers used by member + invite flows.
 */

export const currencyValidator = v.union(v.literal("USD"), v.literal("EUR"));
export const roleValidator = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"));
export const splitModeValidator = v.union(
  v.literal("equal_people"),
  v.literal("equal_groups"),
  v.literal("custom"),
  v.literal("covered_group")
);

export async function requirePodMember(ctx: AnyCtx, podId: Id<"moneyPods">) {
  const userId = await requireUser(ctx);
  const user = await ctx.db.get(userId);
  const email = verifiedInvitationEmail(user);
  const direct = await ctx.db
    .query("podMembers")
    .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
    .filter((q) => q.eq(q.field("podId"), podId))
    .unique();
  if (direct && !activePodMembership(direct)) throw new ConvexError({ code: "FORBIDDEN", message: "Not a member of this money pod" });
  if (direct) return { userId, member: direct, role: direct.role };
  if (email) {
    const invited = await ctx.db
      .query("podMembers")
      .withIndex("by_email", (q) => q.eq("invitedEmail", email))
      .filter((q) => q.eq(q.field("podId"), podId))
      .unique();
    if (invited && !invited.linkedUserId && activePodMembership(invited)) return { userId, member: invited, role: invited.role };
  }
  const pod = await ctx.db.get(podId);
  if (pod?.ownerUserId === userId) {
    const ownerMember = await ctx.db
      .query("podMembers")
      .withIndex("by_pod", (q) => q.eq("podId", podId))
      .filter((q) => q.eq(q.field("linkedUserId"), userId))
      .unique();
    if (ownerMember && activePodMembership(ownerMember)) return { userId, member: ownerMember, role: ownerMember.role };
  }
  throw new ConvexError({ code: "FORBIDDEN", message: "Not a member of this money pod" });
}

export async function requirePodEditor(ctx: AnyCtx, podId: Id<"moneyPods">) {
  const access = await requirePodMember(ctx, podId);
  if (access.role !== "owner" && access.role !== "editor") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Editor role required" });
  }
  return access;
}

export async function requirePodOwner(ctx: AnyCtx, podId: Id<"moneyPods">) {
  const access = await requirePodMember(ctx, podId);
  if (access.role !== "owner") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Owner role required" });
  }
  return access;
}

export async function requirePodCurrency(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  currency: "USD" | "EUR"
) {
  const pod = await ctx.db.get(podId);
  if (!pod) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Money pod not found" });
  }
  if (pod.currency !== currency) {
    throw new ConvexError({
      code: "INVALID_CURRENCY",
      message: "Shared pod entries must use the pod currency"
    });
  }
  return pod;
}

export async function displayNameFor(ctx: AnyCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const user = await ctx.db.get(userId);
  return (
    profile?.displayName ??
    (user as { name?: string } | null)?.name ??
    ((user as { email?: string } | null)?.email ?? "").split("@")[0] ??
    "Member"
  );
}

export async function userIdForEmail(ctx: AnyCtx, email: string) {
  const matched = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
  if (!matched) return undefined;
  if (verifiedInvitationEmail(matched)) return matched._id;
  // The existing authenticated owner is already identified by user id, not this address.
  // Preserve self-invite/duplicate rejection without granting a different unverified user access.
  return matched._id === await requireUser(ctx) ? matched._id : undefined;
}

export async function assertNoDuplicatePodEmail(
  ctx: AnyCtx,
  podId: Id<"moneyPods">,
  email: string,
  linkedUserId?: Id<"users">
) {
  const existingEmail = await ctx.db
    .query("podMembers")
    .withIndex("by_email", (q) => q.eq("invitedEmail", email))
    .filter((q) => q.eq(q.field("podId"), podId))
    .unique();
  if (existingEmail) {
    throw new ConvexError({ code: "DUPLICATE", message: "This email is already in the money pod" });
  }
  if (!linkedUserId) return;
  const existingUser = await ctx.db
    .query("podMembers")
    .withIndex("by_user", (q) => q.eq("linkedUserId", linkedUserId))
    .filter((q) => q.eq(q.field("podId"), podId))
    .unique();
  if (existingUser) {
    throw new ConvexError({ code: "DUPLICATE", message: "This user is already in the money pod" });
  }
}
