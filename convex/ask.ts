import Anthropic from "@anthropic-ai/sdk";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import {
  ASK_LIMITS,
  ASK_SYSTEM_PROMPT,
  PROPOSE_ENTRY_TOOL,
  normalizeHistory,
  normalizeProposal,
  type AskProposal,
} from "./lib/askProposals";
import { rateLimitExpiresAt } from "./lib/privacyRetention";
import { readAISharingState, type AISharingDeniedReason } from "./lib/aiPermission";

declare const process: { env: Record<string, string | undefined> };

/**
 * Claude-powered Ask. The app answers what it can on the device first and only sends the
 * rest here, with a short summary of the person's numbers. Claude answers and may propose
 * entries; nothing is written here. The person saves each draft through the typed mutations.
 */

const DEFAULT_MODEL = "claude-opus-5-5";
const WINDOWS = [
  { route: "ask:hour", windowMs: 3_600_000, limit: 30 },
  { route: "ask:day", windowMs: 86_400_000, limit: 150 },
] as const;

export type AskReply =
  | { status: "ok"; text: string; proposals: AskProposal[] }
  | { status: "unavailable" | "busy" | "limited" | "declined"; reason?: AISharingDeniedReason };

type AskAuthorization = { status: "allowed" | "limited" } | { status: "denied"; reason: AISharingDeniedReason };

/** Consent and quota commit together. Withdrawal blocks later authorizations, not an already authorized request. */
export const takeAskQuota = internalMutation({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }): Promise<AskAuthorization> => {
    if (await getAuthUserId(ctx) !== userId) return { status: "denied", reason: "account-unavailable" };
    const permission = await readAISharingState(ctx, userId);
    if (!permission.allowed) return { status: "denied", reason: permission.reason ?? "permission-required" };
    const buckets = [];
    for (const w of WINDOWS) {
      const windowStart = Math.floor(now / w.windowMs) * w.windowMs;
      const key = `${w.route}:${userId}:${windowStart}`;
      const bucket = await ctx.db.query("rateLimitBuckets").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (bucket && bucket.count >= w.limit) return { status: "limited" };
      buckets.push({ w, windowStart, key, bucket });
    }
    for (const { w, windowStart, key, bucket } of buckets) {
      if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1, updatedAt: now });
      else await ctx.db.insert("rateLimitBuckets", {
        key, route: w.route, identityHash: userId, windowStart, windowMs: w.windowMs, limit: w.limit, count: 1, updatedAt: now,
        expiresAt: rateLimitExpiresAt(windowStart, w.windowMs),
      });
    }
    return { status: "allowed" };
  },
});

export const reply = action({
  args: {
    // Older callers fail closed without receiving a new, unknown response status.
    expectedUserId: v.optional(v.id("users")),
    message: v.string(),
    context: v.string(),
    history: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() })),
  },
  handler: async (ctx, args): Promise<AskReply> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to ask Numa" });
    if (!args.expectedUserId || args.expectedUserId !== userId) return { status: "declined", reason: "account-unavailable" };
    const message = args.message.trim();
    if (!message || message.length > ASK_LIMITS.message || args.context.length > ASK_LIMITS.context || args.history.length > 20) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "That message is too long" });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { status: "unavailable" };
    const authorization: AskAuthorization = await ctx.runMutation(internal.ask.takeAskQuota, { userId, now: Date.now() });
    if (authorization.status === "denied") return { status: "declined", reason: authorization.reason };
    if (authorization.status === "limited") return { status: "limited" };

    const model = process.env.NUMA_ASK_MODEL || DEFAULT_MODEL;
    // Server-side fallback re-runs a declined request on the model Anthropic recommends. Haiku has none.
    const fallback = !/haiku/.test(model);
    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    const history = normalizeHistory(args.history);
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 8_000,
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { effort: "low" },
        system: [
          { type: "text", text: ASK_SYSTEM_PROMPT },
          { type: "text", text: `The person's numbers:\n${args.context}`, cache_control: { type: "ephemeral" } },
        ],
        tools: [PROPOSE_ENTRY_TOOL as unknown as Anthropic.Beta.BetaTool],
        tool_choice: { type: "auto" },
        messages: [
          ...history.map((turn) => ({ role: turn.role, content: turn.text })),
          { role: "user" as const, content: message },
        ],
      });
      if (response.stop_reason === "refusal") return { status: "declined" };
      let text = "";
      const proposals: AskProposal[] = [];
      for (const block of response.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use" && block.name === PROPOSE_ENTRY_TOOL.name && proposals.length < ASK_LIMITS.proposals) {
          const proposal = normalizeProposal(block.input);
          if (proposal) proposals.push(proposal);
        }
      }
      text = text.trim();
      if (!text && !proposals.length) return { status: "unavailable" };
      return { status: "ok", text, proposals };
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      // Only the status is logged: never the question, the numbers or the key.
      console.warn("ask.reply provider error", status ?? "network");
      return { status: status === 429 || status === 529 ? "busy" : "unavailable" };
    }
  },
});
