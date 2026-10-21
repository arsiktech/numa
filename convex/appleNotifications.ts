import { makeFunctionReference } from "convex/server";
import { httpAction } from "./_generated/server";
import { APPLE_KEYS_URL, type AppleJwk } from "./lib/appleIdentity";
import { verifyAppleRevocationEvent, type AppleRevocationEvent } from "./lib/appleNotifications";
declare const process: { env: Record<string, string | undefined> };
const deleteRef = makeFunctionReference<"mutation", AppleRevocationEvent>("users:deleteForAppleRevocation");
let cache: { keys: AppleJwk[]; at: number } | null = null;
async function keys(refresh = false): Promise<AppleJwk[]> {
  if (!refresh && cache && Date.now() - cache.at < 3600000) return cache.keys;
  const result = await fetch(APPLE_KEYS_URL, { signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error("Apple keys unavailable");
  const body = await result.json() as { keys?: AppleJwk[] };
  if (!Array.isArray(body.keys)) throw new Error("Invalid Apple keys");
  cache = { keys: body.keys, at: Date.now() }; return cache.keys;
}
/** Parent must register POST /apple/notifications in http.ts. No live registration performed. */
export const receive = httpAction(async (ctx, request) => {
  // Immediate account deletion on an external Apple event is a separate rollout decision.
  if (process.env.APPLE_NOTIFICATIONS_ENABLED !== "true") return new Response(null, { status: 503 });
  try {
    const text = await request.text();
    if (text.length > 20000) return new Response(null, { status: 413 });
    const body = JSON.parse(text) as { payload?: unknown };
    if (typeof body.payload !== "string") return new Response(null, { status: 400 });
    const event = await verifyAppleRevocationEvent(body.payload, await keys(), Date.now()).catch(async error => {
      if (error instanceof Error && error.message === "unknown key") return verifyAppleRevocationEvent(body.payload as string, await keys(true), Date.now());
      throw error;
    });
    if (event) await ctx.runMutation(deleteRef, event);
    return new Response(null, { status: 200 });
  } catch { return new Response(null, { status: 400 }); }
});
