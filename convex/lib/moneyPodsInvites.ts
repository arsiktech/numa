import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireUser } from "./access";
import { displayNameFor, requirePodOwner } from "./podAccess";
import { normalizeEmail } from "./inputGuards";

/* ---------------------------------------------------------------------------
 * Shareable invite codes
 *
 * Same hashed-secret posture as webhookTokens: the raw code is returned once
 * to the owner and only its SHA-256 hex lands in the table. Joining validates
 * hash + expiry + revocation and re-activates a tombstoned member instead of
 * duplicating them.
 * ------------------------------------------------------------------------ */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Hex-encode SHA-256 inside the Convex isolate (same idiom as webhookTokens). */
async function sha256Hex(input: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function generateInviteCode(): string {
  // Unambiguous lowercase base31 (no 0/o, 1/i/l) so the code survives being
  // read aloud; 31^10 ≈ 8e14 against hash-only storage and a 7-day TTL.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

/**
 * Owner mints a fresh share code for the pod. Any previous live code is
 * revoked first so the People sheet always talks about ONE active link.
 * Returns the raw code exactly once.
 */
const createInviteCode = mutation({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requirePodOwner(ctx, args.podId);
    const now = Date.now();
    const existing = await ctx.db
      .query("podInvites")
      .withIndex("by_pod", (q) => q.eq("podId", args.podId))
      .collect();
    for (const invite of existing) {
      if (!invite.revoked && invite.expiresAt > now) {
        await ctx.db.patch(invite._id, { revoked: true });
      }
    }
    const code = generateInviteCode();
    const expiresAt = now + INVITE_TTL_MS;
    await ctx.db.insert("podInvites", {
      podId: args.podId,
      codeHash: await sha256Hex(code),
      createdByUserId: userId,
      createdAt: now,
      expiresAt
    });
    return { code, expiresAt };
  }
});

/** Owner kills every live code for the pod (the link stops working at once). */
const revokeInviteCodes = mutation({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodOwner(ctx, args.podId);
    const rows = await ctx.db
      .query("podInvites")
      .withIndex("by_pod", (q) => q.eq("podId", args.podId))
      .collect();
    let revoked = 0;
    for (const row of rows) {
      if (!row.revoked) {
        await ctx.db.patch(row._id, { revoked: true });
        revoked += 1;
      }
    }
    return { revoked };
  }
});

/** Owner-only metadata about the live code (never the code or its hash). */
const activeInviteCode = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodOwner(ctx, args.podId);
    const now = Date.now();
    const rows = await ctx.db
      .query("podInvites")
      .withIndex("by_pod", (q) => q.eq("podId", args.podId))
      .collect();
    const active = rows.find((row) => !row.revoked && row.expiresAt > now);
    return active ? { createdAt: active.createdAt, expiresAt: active.expiresAt } : null;
  }
});

/**
 * Signed-in user redeems a share code. Idempotent by design: an existing
 * active member is a no-op success, a tombstoned member is re-activated
 * (keeping their expense/settlement history attached to the same member id),
 * and only a genuinely new user gets a fresh editor row.
 */
const joinPodByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const code = args.code.trim().toLowerCase();
    if (!code) {
      throw new ConvexError({ code: "INVITE_INVALID", message: "Invite code is empty" });
    }
    const hash = await sha256Hex(code);
    const invite = await ctx.db
      .query("podInvites")
      .withIndex("by_hash", (q) => q.eq("codeHash", hash))
      .unique();
    const now = Date.now();
    if (!invite || invite.revoked || invite.expiresAt <= now) {
      throw new ConvexError({
        code: "INVITE_INVALID",
        message: "This invite link is invalid or has expired"
      });
    }
    const pod = await ctx.db.get(invite.podId);
    if (!pod) {
      throw new ConvexError({ code: "INVITE_INVALID", message: "This pot no longer exists" });
    }
    const user = await ctx.db.get(userId);
    const email = normalizeEmail((user as { email?: string } | null)?.email ?? "");
    const members = await ctx.db
      .query("podMembers")
      .withIndex("by_pod", (q) => q.eq("podId", invite.podId))
      .collect();
    const mine = members.find(
      (member) =>
        (member.linkedUserId && String(member.linkedUserId) === String(userId)) ||
        (email.length > 0 && member.invitedEmail === email)
    );
    if (mine) {
      if (mine.active === false) {
        await ctx.db.patch(mine._id, {
          active: true,
          removedAt: undefined,
          linkedUserId: userId
        });
      } else if (!mine.linkedUserId) {
        await ctx.db.patch(mine._id, { linkedUserId: userId });
      }
      return {
        podId: invite.podId,
        memberId: mine._id,
        alreadyMember: mine.active !== false
      };
    }
    const displayName = await displayNameFor(ctx, userId);
    const memberId = await ctx.db.insert("podMembers", {
      podId: invite.podId,
      displayName,
      invitedEmail: email.length > 0 ? email : undefined,
      linkedUserId: userId,
      role: "editor",
      joinedAt: now
    });
    return { podId: invite.podId, memberId, alreadyMember: false };
  }
});

export const moneyPodsInvites = {
  createInviteCode,
  revokeInviteCodes,
  activeInviteCode,
  joinPodByCode
};
