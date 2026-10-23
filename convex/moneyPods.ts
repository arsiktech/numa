import { v, ConvexError } from "convex/values";
import { activePodMembership, verifiedInvitationEmail } from "./lib/invitationAuthority";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import {
  assertNoDuplicatePodEmail,
  currencyValidator,
  displayNameFor,
  requirePodMember,
  requirePodOwner,
  roleValidator,
  userIdForEmail
} from "./lib/podAccess";
import {
  requirePodGroup as requireGroupInPod,
  validatePodGroup as validateGroupInPod
} from "./lib/podValidation";
import { cleanRequired, displayNameFromEmail, isEmailLike, normalizeEmail } from "./lib/inputGuards";
import { moneyPodsEntries } from "./lib/moneyPodsEntries";
import { moneyPodsInvites } from "./lib/moneyPodsInvites";

/**
 * Money-pod API surface. Functions defined in lib/moneyPods* modules are
 * re-exported here so every public path stays api.moneyPods.*.
 */
export const {
  addExpense,
  updateExpense,
  removeExpense,
  addSettlement,
  updateSettlement,
  removeSettlement
} = moneyPodsEntries;
export const {
  createInviteCode,
  revokeInviteCodes,
  activeInviteCode,
  joinPodByCode
} = moneyPodsInvites;

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = verifiedInvitationEmail(user);
    const memberships = await ctx.db
      .query("podMembers")
      .withIndex("by_user", (q) => q.eq("linkedUserId", userId))
      .collect();
    const invitedMemberships = email
      ? await ctx.db
          .query("podMembers")
          .withIndex("by_email", (q) => q.eq("invitedEmail", email))
          .collect()
      : [];
    const owned = await ctx.db
      .query("moneyPods")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .collect();
    const byId = new Map<string, Id<"moneyPods">>();
    for (const membership of memberships.filter(activePodMembership)) byId.set(String(membership.podId), membership.podId);
    for (const membership of invitedMemberships.filter(m => !m.linkedUserId && activePodMembership(m))) byId.set(String(membership.podId), membership.podId);
    for (const pod of owned) byId.set(String(pod._id), pod._id);
    const pods = await Promise.all([...byId.values()].map((id) => ctx.db.get(id)));
    return pods.filter((p): p is NonNullable<typeof p> => p !== null);
  }
});

export const create = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    name: v.string(),
    currency: currencyValidator,
    groups: v.optional(v.array(v.object({ name: v.string(), color: v.string() }))),
    members: v.optional(
      v.array(
        v.object({
          displayName: v.string(),
          email: v.string(),
          groupIndex: v.optional(v.number()),
          role: v.optional(roleValidator),
          linkedPortfolioId: v.optional(v.id("portfolios"))
        })
      )
    )
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.create",
      async () => {
        const now = Date.now();
        const podId = await ctx.db.insert("moneyPods", {
          name: cleanRequired(args.name, "Pod name"),
          currency: args.currency,
          ownerUserId: userId,
          createdAt: now
        });

        const groupIds: Id<"podGroups">[] = [];
        for (const group of args.groups ?? []) {
          groupIds.push(
            await ctx.db.insert("podGroups", {
              podId,
              name: cleanRequired(group.name, "Group name"),
              color: cleanRequired(group.color, "Group color")
            })
          );
        }

        const ownerName = await displayNameFor(ctx, userId);
        await ctx.db.insert("podMembers", {
          podId,
          displayName: ownerName,
          linkedUserId: userId,
          groupId: groupIds[0],
          role: "owner",
          joinedAt: now
        });

        for (const member of args.members ?? []) {
          const email = normalizeEmail(member.email);
          if (!isEmailLike(email)) {
            throw new ConvexError({ code: "INVALID_EMAIL", message: "Money pod members must be invited by email" });
          }
          const linkedUserId = await userIdForEmail(ctx, email);
          if (linkedUserId === userId) continue;
          await assertNoDuplicatePodEmail(ctx, podId, email, linkedUserId);
          await ctx.db.insert("podMembers", {
            podId,
            displayName: member.displayName.trim() || displayNameFromEmail(email),
            invitedEmail: email,
            linkedUserId,
            linkedPortfolioId: member.linkedPortfolioId,
            groupId:
              member.groupIndex !== undefined && member.groupIndex >= 0
                ? groupIds[member.groupIndex]
                : undefined,
            role: member.role ?? "editor",
            joinedAt: now
          });
        }

        return podId;
      }
    );
  }
});

export const listMembers = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodMember(ctx, args.podId);
    return await ctx.db
      .query("podMembers")
      .withIndex("by_pod", (q) => q.eq("podId", args.podId))
      .collect();
  }
});

export const listGroups = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodMember(ctx, args.podId);
    return await ctx.db
      .query("podGroups")
      .withIndex("by_pod", (q) => q.eq("podId", args.podId))
      .collect();
  }
});

export const listExpenses = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodMember(ctx, args.podId);
    return await ctx.db
      .query("podExpenses")
      .withIndex("by_pod_time", (q) => q.eq("podId", args.podId))
      .collect();
  }
});

export const listSettlements = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodMember(ctx, args.podId);
    return await ctx.db
      .query("podSettlements")
      .withIndex("by_pod_time", (q) => q.eq("podId", args.podId))
      .collect();
  }
});

export const getBundle = query({
  args: { podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    await requirePodMember(ctx, args.podId);
    const [members, groups, expenses, settlements] = await Promise.all([
      ctx.db
        .query("podMembers")
        .withIndex("by_pod", (q) => q.eq("podId", args.podId))
        .collect(),
      ctx.db
        .query("podGroups")
        .withIndex("by_pod", (q) => q.eq("podId", args.podId))
        .collect(),
      ctx.db
        .query("podExpenses")
        .withIndex("by_pod_time", (q) => q.eq("podId", args.podId))
        .collect(),
      ctx.db
        .query("podSettlements")
        .withIndex("by_pod_time", (q) => q.eq("podId", args.podId))
        .collect()
    ]);
    return { members, groups, expenses, settlements };
  }
});

export const update = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    podId: v.id("moneyPods"),
    name: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.update",
      async () => {
        await requirePodOwner(ctx, args.podId);
        if (args.name !== undefined) {
          await ctx.db.patch(args.podId, { name: cleanRequired(args.name, "Pod name") });
        }
        return args.podId;
      }
    );
  }
});

export const addMember = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    podId: v.id("moneyPods"),
    displayName: v.string(),
    email: v.string(),
    groupId: v.optional(v.id("podGroups")),
    role: v.optional(roleValidator),
    cards: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.addMember",
      async () => {
        await requirePodOwner(ctx, args.podId);
        await validateGroupInPod(ctx, args.podId, args.groupId);
        const email = normalizeEmail(args.email);
        if (!isEmailLike(email)) {
          throw new ConvexError({ code: "INVALID_EMAIL", message: "Money pod members must be invited by email" });
        }
        const linkedUserId = await userIdForEmail(ctx, email);
        await assertNoDuplicatePodEmail(ctx, args.podId, email, linkedUserId);
        const cleanCards = args.cards
          ?.map((c) => c.trim())
          .filter((c) => c.length > 0);
        return await ctx.db.insert("podMembers", {
          podId: args.podId,
          displayName: args.displayName.trim() || displayNameFromEmail(email),
          invitedEmail: email,
          linkedUserId,
          groupId: args.groupId,
          role: args.role ?? "editor",
          joinedAt: Date.now(),
          cards: cleanCards && cleanCards.length > 0 ? cleanCards : undefined
        });
      }
    );
  }
});

/**
 * Patch a member row. Authorization is split:
 *   - Owner can patch anyone's displayName / groupId / cards
 *   - Non-owner can patch ONLY their own row, and ONLY the cards field
 *
 * This is what lets Kim add her own "Revolut" card to the shared pot
 * without involving the owner — invited members own their card list, the
 * owner owns the structural fields (name, group assignment, removal).
 */
export const updateMember = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    memberId: v.id("podMembers"),
    displayName: v.optional(v.string()),
    groupId: v.optional(v.union(v.id("podGroups"), v.null())),
    cards: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.updateMember",
      async () => {
        const member = await ctx.db.get(args.memberId);
        if (!member) throw new ConvexError({ code: "NOT_FOUND", message: "Member not found" });
        const access = await requirePodMember(ctx, member.podId);
        const isOwner = access.role === "owner";
        const isSelf = String(access.member._id) === String(member._id);
        if (!isOwner && !isSelf) {
          throw new ConvexError({ code: "FORBIDDEN", message: "Only the owner can edit other members" });
        }
        const patch: Record<string, unknown> = {};
        if (args.cards !== undefined) {
          const cleanCards = args.cards
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
          patch.cards = cleanCards.length > 0 ? cleanCards : undefined;
        }
        if (args.displayName !== undefined) {
          if (!isOwner) {
            throw new ConvexError({
              code: "FORBIDDEN",
              message: "Only the owner can rename members"
            });
          }
          patch.displayName = cleanRequired(args.displayName, "Member name");
        }
        if (args.groupId !== undefined) {
          if (!isOwner) {
            throw new ConvexError({
              code: "FORBIDDEN",
              message: "Only the owner can reassign members"
            });
          }
          if (args.groupId === null) patch.groupId = undefined;
          else {
            await requireGroupInPod(ctx, member.podId, args.groupId);
            patch.groupId = args.groupId;
          }
        }
        await ctx.db.patch(args.memberId, patch);
        return args.memberId;
      }
    );
  }
});

/**
 * Remove a member from a pod. Owner-only. Members can't kick themselves —
 * if they want to leave they ask the owner to remove them.
 */
export const removeMember = mutation({
  args: { clientMutationId: v.optional(v.string()), memberId: v.id("podMembers") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.removeMember",
      async () => {
        const member = await ctx.db.get(args.memberId);
        if (!member) throw new ConvexError({ code: "NOT_FOUND", message: "Member not found" });
        await requirePodOwner(ctx, member.podId);
        if (member.role === "owner") {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "The pot owner can't be removed — delete the pot instead"
          });
        }
        // Tombstone, never hard-delete. The departing member stays in the
        // settlement inputs so expenses they paid keep their credit, their
        // share of past expenses is still charged, custom splits stay summing
        // to 10000, and settlements they were party to are preserved — the
        // pod's balances continue to net to zero. UIs filter inactive members
        // out of pickers/rosters but keep showing any balance still owed.
        await ctx.db.patch(args.memberId, { active: false, removedAt: Date.now() });
        return args.memberId;
      }
    );
  }
});

// Self-service: a non-owner removes THEIR OWN membership and exits the pot.
// Mirrors removeMember's tombstone, but authorizes the caller via
// requirePodMember (their own row) instead of requiring owner.
export const leaveMoneyPod = mutation({
  args: { clientMutationId: v.optional(v.string()), podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.leaveMoneyPod",
      async () => {
        const access = await requirePodMember(ctx, args.podId);
        const pod = await ctx.db.get(args.podId);
        if (access.role === "owner" || pod?.ownerUserId === userId) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "The pot owner can't leave — delete the pot instead"
          });
        }
        const memberId = access.member._id;
        // Tombstone, never hard-delete — see removeMember. The leaver stays in
        // the settlement inputs so balances keep netting to zero and any money
        // they owe / are owed is preserved until it's actually settled up.
        await ctx.db.patch(memberId, { active: false, removedAt: Date.now() });
        return memberId;
      }
    );
  }
});

export const addGroup = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    podId: v.id("moneyPods"),
    name: v.string(),
    color: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.addGroup",
      async () => {
        await requirePodOwner(ctx, args.podId);
        return await ctx.db.insert("podGroups", {
          podId: args.podId,
          name: cleanRequired(args.name, "Group name"),
          color: cleanRequired(args.color, "Group color")
        });
      }
    );
  }
});

export const updateGroup = mutation({
  args: {
    clientMutationId: v.optional(v.string()),
    groupId: v.id("podGroups"),
    name: v.optional(v.string()),
    color: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.updateGroup",
      async () => {
        const group = await ctx.db.get(args.groupId);
        if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "Group not found" });
        await requirePodOwner(ctx, group.podId);
        const patch: Record<string, string> = {};
        if (args.name !== undefined) patch.name = cleanRequired(args.name, "Group name");
        if (args.color !== undefined) patch.color = cleanRequired(args.color, "Group color");
        await ctx.db.patch(args.groupId, patch);
        return args.groupId;
      }
    );
  }
});

export const removeGroup = mutation({
  args: { clientMutationId: v.optional(v.string()), groupId: v.id("podGroups") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.removeGroup",
      async () => {
        const group = await ctx.db.get(args.groupId);
        if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "Group not found" });
        await requirePodOwner(ctx, group.podId);
        const members = await ctx.db
          .query("podMembers")
          .withIndex("by_pod", (q) => q.eq("podId", group.podId))
          .collect();
        for (const member of members) {
          if (String(member.groupId) === String(args.groupId)) {
            await ctx.db.patch(member._id, { groupId: undefined });
          }
        }
        const expenses = await ctx.db
          .query("podExpenses")
          .withIndex("by_pod_time", (q) => q.eq("podId", group.podId))
          .collect();
        for (const expense of expenses) {
          if (String(expense.coveredGroupId) === String(args.groupId)) {
            await ctx.db.patch(expense._id, {
              coveredGroupId: undefined,
              splitMode: "equal_people"
            });
          }
        }
        await ctx.db.delete(args.groupId);
        return args.groupId;
      }
    );
  }
});


export const remove = mutation({
  args: { clientMutationId: v.optional(v.string()), podId: v.id("moneyPods") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "moneyPods.remove",
      async () => {
        await requirePodOwner(ctx, args.podId);
        const expenses = await ctx.db
          .query("podExpenses")
          .withIndex("by_pod_time", (q) => q.eq("podId", args.podId))
          .collect();
        for (const row of expenses) await ctx.db.delete(row._id);
        const settlements = await ctx.db
          .query("podSettlements")
          .withIndex("by_pod_time", (q) => q.eq("podId", args.podId))
          .collect();
        for (const row of settlements) await ctx.db.delete(row._id);
        const members = await ctx.db
          .query("podMembers")
          .withIndex("by_pod", (q) => q.eq("podId", args.podId))
          .collect();
        for (const row of members) await ctx.db.delete(row._id);
        const groups = await ctx.db
          .query("podGroups")
          .withIndex("by_pod", (q) => q.eq("podId", args.podId))
          .collect();
        for (const row of groups) await ctx.db.delete(row._id);
        const invites = await ctx.db
          .query("podInvites")
          .withIndex("by_pod", (q) => q.eq("podId", args.podId))
          .collect();
        for (const row of invites) await ctx.db.delete(row._id);
        await ctx.db.delete(args.podId);
        return args.podId;
      }
    );
  }
});
