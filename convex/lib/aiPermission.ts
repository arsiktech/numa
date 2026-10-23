import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { AI_SHARING_VERSION } from "./privacyPolicy";

export type AISharingDeniedReason = "account-unavailable" | "deletion-pending" | "permission-required";

/** One decision contract for the public status and final provider authorization. */
export async function readAISharingState(ctx: Pick<QueryCtx, "db">, userId: Id<"users"> | null) {
  const user = userId ? await ctx.db.get(userId) : null;
  const [profile, choice] = userId && user ? await Promise.all([
    ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).unique(),
    ctx.db.query("privacyChoices").withIndex("by_user", q => q.eq("userId", userId)).unique(),
  ]) : [null, null];
  const deletionPending = profile?.deletionScheduledAt !== undefined || profile?.deletionStartedAt !== undefined;
  const granted = Boolean(choice?.allowed && choice.version === AI_SHARING_VERSION);
  const deletionStarted = profile?.deletionStartedAt !== undefined;
  const allowed = Boolean(user && !deletionPending && granted);
  const reason: AISharingDeniedReason | null = !user ? "account-unavailable" : deletionPending ? "deletion-pending" : !allowed ? "permission-required" : null;
  return { userId: user ? userId : null, requiredVersion: AI_SHARING_VERSION, allowed,
    decidedAt: choice?.recordedAt ?? null, deletionPending, deletionStarted, granted, reason };
}
