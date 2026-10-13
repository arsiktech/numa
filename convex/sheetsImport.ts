import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { classifyExport, classifyWorkbook, exportUrl, MAX_SHEET_BYTES, parseSheetLink, redirectTarget, type SheetFetch } from "./lib/googleSheets";
import { rateLimitExpiresAt } from "./lib/privacyRetention";

/**
 * Reads a Google Sheet shared by link: the tab the link names as CSV, or the whole workbook as
 * Excel when it names none. The app previews it like a chosen file. Nothing is stored here; the app saves only what the person confirms.
 */

const WINDOW = { route: "sheets:hour", windowMs: 3_600_000, limit: 30 } as const;

export const takeSheetQuota = internalMutation({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }): Promise<boolean> => {
    const windowStart = Math.floor(now / WINDOW.windowMs) * WINDOW.windowMs;
    const key = `${WINDOW.route}:${userId}:${windowStart}`;
    const bucket = await ctx.db.query("rateLimitBuckets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (bucket && bucket.count >= WINDOW.limit) return false;
    if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1, updatedAt: now });
    else await ctx.db.insert("rateLimitBuckets", {
      key, route: WINDOW.route, identityHash: userId, windowStart, windowMs: WINDOW.windowMs, limit: WINDOW.limit, count: 1, updatedAt: now,
      expiresAt: rateLimitExpiresAt(windowStart, WINDOW.windowMs),
    });
    return true;
  },
});

export type SheetReply = SheetFetch | { status: "badLink" | "limited" };

export const readSheet = action({
  args: { link: v.string() },
  handler: async (ctx, { link }): Promise<SheetReply> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to import" });
    const ref = parseSheetLink(link);
    if (!ref) return { status: "badLink" };
    const allowed: boolean = await ctx.runMutation(internal.sheetsImport.takeSheetQuota, { userId, now: Date.now() });
    if (!allowed) return { status: "limited" };
    try {
      // Follow Google's own hops only: a shared sheet is served from googleusercontent.com.
      let url = exportUrl(ref);
      let res = await fetch(url, { redirect: "manual" });
      for (let hop = 0; hop < 4 && res.status >= 300 && res.status < 400; hop++) {
        const next = redirectTarget(res.headers.get("location"), url);
        if (next.kind === "private") return { status: "private" };
        if (next.kind === "refused") return { status: "failed" };
        url = next.url;
        res = await fetch(url, { redirect: "manual" });
      }
      if (res.status >= 300 && res.status < 400) return { status: "failed" };
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_SHEET_BYTES) return { status: "tooBig" };
      const type = res.headers.get("content-type") ?? "";
      return ref.gid ? classifyExport(res.status, type, await res.text()) : classifyWorkbook(res.status, type, new Uint8Array(await res.arrayBuffer()));
    } catch {
      return { status: "failed" };
    }
  },
});
