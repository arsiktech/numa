import Anthropic from "@anthropic-ai/sdk";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { ASK_LIMITS, ASK_SYSTEM_PROMPT, PROPOSE_ENTRY_TOOL, normalizeHistory } from "./lib/askProposals";
import { emptyAskDelta, proposalsFrom, takeAskDelta } from "./lib/askStream";
import { AI_SHARING_VERSION } from "./lib/privacyPolicy";

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_MODEL = "claude-opus-5-5";

function cors(request: Request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin && origin !== "null" ? origin : "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Streams the reply into the open Ask bubble. The bearer token is the signed-in session. */
export const stream = httpAction(async (ctx, request) => {
  const headers = cors(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  const userId = await getAuthUserId(ctx);
  if (!userId) return new Response(null, { status: 401, headers });
  let body: { expectedUserId?: string; message?: string; context?: string; history?: { role: "user" | "assistant"; text: string }[] };
  try { body = await request.json(); } catch { return new Response(null, { status: 400, headers }); }
  const message = (body.message ?? "").trim();
  const context = body.context ?? "";
  const history = Array.isArray(body.history) ? body.history : [];
  if (!body.expectedUserId || body.expectedUserId !== userId || !message || message.length > ASK_LIMITS.message || context.length > ASK_LIMITS.context || history.length > 20) {
    return new Response(null, { status: 400, headers });
  }
  const sharing = await ctx.runQuery(internal.privacy.statusFor, { userId });
  if (!sharing || sharing.userId !== userId || !sharing.allowed || sharing.requiredVersion !== AI_SHARING_VERSION) {
    return json({ status: "declined", reason: "permission-required" }, headers);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ status: "unavailable" }, headers);
  const authorization = await ctx.runMutation(internal.ask.chargeAskQuota, { userId, now: Date.now() });
  if (authorization.status === "limited") return json({ status: "limited" }, headers);
  if (authorization.status === "denied") return json({ status: "declined", reason: authorization.reason }, headers);

  const encoder = new TextEncoder();
  const state = emptyAskDelta();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });
        const model = process.env.NUMA_ASK_MODEL || DEFAULT_MODEL;
        const response = await client.beta.messages.create({
          model,
          max_tokens: 8_000,
          stream: true,
          output_config: { effort: "low" },
          system: [
            { type: "text", text: ASK_SYSTEM_PROMPT },
            { type: "text", text: `The person's numbers:\n${context}`, cache_control: { type: "ephemeral" } },
          ],
          tools: [PROPOSE_ENTRY_TOOL as unknown as Anthropic.Beta.BetaTool],
          tool_choice: { type: "auto" },
          messages: [
            ...normalizeHistory(history).map((turn) => ({ role: turn.role, content: turn.text })),
            { role: "user" as const, content: message },
          ],
        });
        for await (const event of response) {
          const before = state.text;
          takeAskDelta(state, event as { type?: string; delta?: { type?: string; text?: string; partial_json?: string } });
          if (state.text !== before) send({ type: "delta", text: state.text.slice(before.length) });
        }
        const text = state.text.trim();
        const proposals = proposalsFrom(state, ASK_LIMITS.proposals);
        send(text || proposals.length ? { type: "done", status: "ok", text, proposals } : { type: "done", status: "unavailable" });
      } catch {
        send({ type: "done", status: "unavailable" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(readable, { headers: { ...headers, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});

function json(body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { headers: { ...headers, "Content-Type": "application/json" } });
}
