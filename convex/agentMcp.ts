import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { SignJWT, importPKCS8 } from "jose";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { sha256Hex, type AgentAuth } from "./agentAccess";
import { AGENT_INSTRUCTIONS, AgentInputError, toolsFor, type AgentIo } from "./lib/agentTools";

/**
 * The MCP endpoint agents connect to (Streamable HTTP, JSON responses).
 * The secret comes either in the link itself (/mcp/<secret>), which works in
 * any client that takes just a URL, or as `Authorization: Bearer <secret>`.
 * Each call runs as the user through the agent's own auth session, by calling
 * the deployment's public functions with a short-lived token.
 */

declare const process: { env: Record<string, string | undefined> };

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "numa-pro", title: "Numa Pro", version: "1.0.0" };
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-session-id",
};

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...extra } });
const rpcError = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

const REFUSALS: Record<Exclude<AgentAuth, { ok: true }>["reason"], [number, string]> = {
  unknown: [401, "This agent link is not valid. Connect the agent again from Numa Pro, Settings, Agents."],
  disconnected: [401, "This agent was disconnected in Numa Pro. Connect it again from Settings, Agents."],
  expired: [401, "This agent's access ended, for example after signing out other devices. Connect it again from Settings, Agents."],
  account: [403, "This Numa Pro account is not available."],
  limited: [429, "Too many calls in a minute. Wait a moment and try again."],
};

function secretFrom(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) return bearer;
  const tail = new URL(request.url).pathname.replace(/^\/mcp\/?/, "");
  return tail ? decodeURIComponent(tail) : null;
}

/** A Convex Auth token for the agent's session, valid for five minutes. */
async function sessionToken(userId: string, sessionId: string): Promise<string> {
  const key = await importPKCS8(process.env.JWT_PRIVATE_KEY ?? "", "RS256");
  return await new SignJWT({ sub: `${userId}|${sessionId}` })
    .setProtectedHeader({ alg: "RS256" }).setIssuedAt().setIssuer(process.env.CONVEX_SITE_URL ?? "").setAudience("convex")
    .setExpirationTime(new Date(Date.now() + 5 * 60_000)).sign(key);
}

function errorText(e: unknown): string {
  if (e instanceof AgentInputError) return e.message;
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string;
    return typeof data === "string" ? data : data?.message ?? "The request was refused.";
  }
  // Server errors from the called function arrive as plain errors with a request id; keep the useful line.
  const message = e instanceof Error ? e.message : String(e);
  const uncaught = message.match(/Uncaught (?:ConvexError|Error): (.+)/)?.[1];
  return (uncaught ?? "Something went wrong in Numa Pro. Try again.").slice(0, 300);
}

export const mcp = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // No server-sent stream: every answer comes back in the POST response.
  if (request.method === "GET") return json({ error: "Use POST" }, 405, { allow: "POST" });
  if (request.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405, { allow: "POST" });

  const secret = secretFrom(request);
  if (!secret || secret.length > 200) return json(rpcError(null, -32001, REFUSALS.unknown[1]), 401, { "www-authenticate": "Bearer" });
  const auth: AgentAuth = await ctx.runMutation(internal.agentAccess.authenticate, { tokenHash: await sha256Hex(secret) });
  if (!auth.ok) {
    const [status, message] = REFUSALS[auth.reason];
    return json(rpcError(null, -32001, message), status, status === 401 ? { "www-authenticate": "Bearer" } : {});
  }

  let body: unknown;
  try { body = await request.json(); } catch { return json(rpcError(null, -32700, "The request is not valid JSON."), 400); }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcRequest[];
  if (!messages.length || messages.length > 20) return json(rpcError(null, -32600, "Send between 1 and 20 messages."), 400);

  const client = new ConvexHttpClient(process.env.CONVEX_CLOUD_URL ?? "");
  client.setAuth(await sessionToken(auth.userId, auth.sessionId));
  // Receipt ids are global, so an agent's own request id is scoped to this connection and tool.
  const ioFor = (tool: string): AgentIo => ({
    query: (path, args) => client.query(makeFunctionReference<"query">(path), args),
    mutation: (path, args) => client.mutation(makeFunctionReference<"mutation">(path), args),
    action: (path, args) => client.action(makeFunctionReference<"action">(path), args),
    requestId: (given) => given === undefined ? `agent:${crypto.randomUUID()}` : `agent:${auth.connectionId}:${tool}:${given}`,
    now: () => Date.now(),
  });
  const tools = toolsFor(auth.access);

  const answer = async (m: RpcRequest): Promise<RpcResponse | null> => {
    if (!m || typeof m !== "object" || typeof m.method !== "string") return rpcError(m?.id, -32600, "Not a JSON-RPC request.");
    const isNotification = m.id === undefined;
    switch (m.method) {
      case "initialize": {
        const asked = typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : PROTOCOL_VERSIONS[0];
        return { jsonrpc: "2.0", id: m.id ?? null, result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO,
          instructions: AGENT_INSTRUCTIONS + (auth.access === "read" ? " This connection can read only; it cannot change anything." : ""),
        } };
      }
      case "ping": return { jsonrpc: "2.0", id: m.id ?? null, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id: m.id ?? null, result: { tools: tools.map((t) => ({
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: !t.write, destructiveHint: t.write && t.name.startsWith("delete"), openWorldHint: false },
        })) } };
      case "tools/call": {
        const name = String(m.params?.name ?? "");
        const tool = tools.find((t) => t.name === name);
        if (!tool) {
          const exists = toolsFor("full").some((t) => t.name === name);
          return rpcError(m.id, -32602, exists ? "This agent can only read. The user can reconnect it with full access in Numa Pro." : `Unknown tool ${name}.`);
        }
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        let result: { content: Array<{ type: "text"; text: string }>; structuredContent?: unknown; isError?: boolean };
        let error: string | undefined;
        try {
          const value = await tool.run(ioFor(tool.name), args);
          const structured = value && typeof value === "object" && !Array.isArray(value) ? value : { result: value ?? null };
          result = { content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }], structuredContent: structured };
        } catch (e) {
          error = errorText(e);
          result = { content: [{ type: "text", text: error }], isError: true };
        }
        await ctx.runMutation(internal.agentAccess.record, { connectionId: auth.connectionId, userId: auth.userId, tool: tool.name, write: tool.write, ok: !error, error });
        return { jsonrpc: "2.0", id: m.id ?? null, result };
      }
      default:
        if (isNotification || m.method.startsWith("notifications/")) return null;
        return rpcError(m.id, -32601, `Method ${m.method} is not supported.`);
    }
  };

  const replies = (await Promise.all(messages.map(answer))).filter((r): r is RpcResponse => r !== null);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? replies : replies[0]);
});
