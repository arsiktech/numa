import { ConvexError, convexToJson, v } from "convex/values";
import { query } from "./_generated/server";
import { requireMember } from "./lib/access";

export const SPACE_EXPORT_SECTIONS = [
  "portfolio", "membership", "categories", "transactions", "assets", "liabilities",
  "holdings", "holdingEvents", "cryptoWallets", "wealthSnapshots", "settlements",
  "goals", "recurring", "ledgerAccounts", "ledgerTransactions", "ledgerLines", "aiActionDrafts", "cashTransfers",
] as const;
const sectionValidator = v.union(...SPACE_EXPORT_SECTIONS.map(section => v.literal(section)));
const scopeArgs = { expectedUserId: v.id("users"), portfolioId: v.id("portfolios"), requestId: v.string() };
function checkRequestId(id: string) {
  if (!id.trim() || id.length > 100) throw new ConvexError("A bounded export request identifier is required.");
}

export const manifest = query({
  args: scopeArgs,
  handler: async (ctx, args) => {
    checkRequestId(args.requestId);
    const { userId } = await requireMember(ctx, args.portfolioId);
    if (userId !== args.expectedUserId) throw new ConvexError("Export account changed. Start again.");
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio) throw new ConvexError("Export space no longer exists.");
    return {
      format: "numa-space-export-v1", userId, portfolioId: portfolio._id,
      name: portfolio.name, currency: portfolio.defaultCurrency, startedAt: Date.now(),
      sections: [...SPACE_EXPORT_SECTIONS],
      consistency: "Live paginated copy, not a point-in-time accounting close. Avoid editing this space during export. Each page records its read time; concurrent edits/deletions can change the copy.",
      interpretation: "Amounts retain their original currency and source precision. Dates are Unix milliseconds. Transfer correction/deletion tombstones are included. Source IDs, classification, reversals and AI provenance are preserved where recorded. Non-JSON Convex values use lossless $bytes, $integer and $float tags. Missing fields remain unknown, not zero. Ledger, operational records and snapshots are alternative representations; do not sum them together.",
      exclusions: [
        "Other spaces and /pod records are not included in this single-space export.",
        "Other users' private profiles, AI drafts and credentials are excluded. Authorized shared financial records retain participant IDs for reconciliation.",
        "Account settings, authentication secrets, provider logs, device subscriptions, invitations, ephemeral wallet-sync leases and raw attachments are not part of this financial export.",
      ],
    };
  },
});

/** One bounded, freshly authorized read per page. Never accepts a table name
 * outside the closed financial manifest. Stable creation-order indexes avoid
 * moving a transaction across a cursor when its occurredAt is edited. */
export const page = query({
  args: { ...scopeArgs, section: sectionValidator, cursor: v.union(v.string(), v.null()), limit: v.union(v.literal(32), v.literal(8), v.literal(1)) },
  handler: async (ctx, args) => {
    checkRequestId(args.requestId);
    const { userId, membership } = await requireMember(ctx, args.portfolioId);
    if (userId !== args.expectedUserId) throw new ConvexError("Export account changed. Start again.");
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio) throw new ConvexError("Export space no longer exists.");
    // A Convex document is at most 1 MiB. This bounds a page's underlying read
    // independently of the user's history length. SplitRequired must fail closed.
    const options = { cursor: args.cursor, numItems: args.limit, maximumBytesRead: 2 * 1024 * 1024, maximumRowsRead: 64 };
    const id = args.portfolioId;
    const read = async () => {
      switch (args.section) {
        case "portfolio": case "membership":
          if (args.cursor !== null) throw new ConvexError("Invalid single-record export cursor.");
          return { page: [args.section === "portfolio" ? portfolio : membership], isDone: true, continueCursor: "" };
        case "categories": return ctx.db.query("categories").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "transactions": return ctx.db.query("transactions").withIndex("by_portfolio_export", q => q.eq("portfolioId", id)).paginate(options);
        case "cashTransfers": return ctx.db.query("cashTransfers").withIndex("by_portfolio_export", q => q.eq("portfolioId", id)).paginate(options);
        case "assets": return ctx.db.query("assets").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "liabilities": return ctx.db.query("liabilities").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "holdings": return ctx.db.query("holdings").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "holdingEvents": return ctx.db.query("holdingEvents").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "cryptoWallets": return ctx.db.query("cryptoWallets").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "wealthSnapshots": return ctx.db.query("wealthSnapshots").withIndex("by_portfolio_export", q => q.eq("portfolioId", id)).paginate(options);
        case "settlements": return ctx.db.query("settlements").withIndex("by_portfolio_export", q => q.eq("portfolioId", id)).paginate(options);
        case "goals": return ctx.db.query("goals").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "recurring": return ctx.db.query("recurring").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "ledgerAccounts": return ctx.db.query("ledgerAccounts").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "ledgerTransactions": return ctx.db.query("ledgerTransactions").withIndex("by_portfolio_export", q => q.eq("portfolioId", id)).paginate(options);
        case "ledgerLines": return ctx.db.query("ledgerLines").withIndex("by_portfolio", q => q.eq("portfolioId", id)).paginate(options);
        case "aiActionDrafts": return ctx.db.query("aiActionDrafts").withIndex("by_user_portfolio", q => q.eq("userId", userId).eq("portfolioId", id)).paginate(options);
      }
    };
    const result = await read();

    const rows = result.page.map(row => {
      if (args.section === "cryptoWallets") {
        const { syncLeaseId: _lease, syncLeaseUntil: _until, ...safe } = row as typeof row & { syncLeaseId?: string; syncLeaseUntil?: number };
        void _lease; void _until;
        return safe;
      }
      if (args.section === "membership") {
        const { avatarUrl: _avatar, ...safe } = membership;
        void _avatar;
        return safe;
      }
      return row;
    });
    const rowsJSON = JSON.stringify(convexToJson(rows));
    // A split-required page can be incomplete. Discard it and retry the SAME
    // cursor with a smaller limit; never label or append it as exported data.
    if (("pageStatus" in result && result.pageStatus === "SplitRequired") ||
        new TextEncoder().encode(JSON.stringify(rowsJSON)).byteLength > 8 * 1024 * 1024) {
      if (args.limit === 1) throw new ConvexError("A record exceeds the safe export limit. No complete file was produced. Contact support.");
      return { userId, portfolioId: id, section: args.section, rowsJSON: "[]", rowCount: 0,
        isDone: false, continueCursor: args.cursor, sampledAt: Date.now(), retryLimit: args.limit === 32 ? 8 : 1 };
    }
    return {
      userId, portfolioId: id, section: args.section, rowsJSON,
      rowCount: rows.length, isDone: result.isDone,
      continueCursor: result.isDone ? null : result.continueCursor, sampledAt: Date.now(), retryLimit: null,
    };
  },
});
