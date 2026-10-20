import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireMember } from "./lib/access";
import { earningsOf, type PositionEarnings } from "./lib/defiEarnings";

/** Up to this many days of readings per wallet, so a query stays well inside Convex's read limits. */
const MAX_DAYS = 180;

/** What each DeFi strategy in the space has earned since Numa started reading it, wallet by wallet. */
export const forPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, { portfolioId }): Promise<Array<PositionEarnings & { walletId: string; wallet: string }>> => {
    await requireMember(ctx, portfolioId);
    const wallets = await ctx.db.query("cryptoWallets").withIndex("by_portfolio", (q) => q.eq("portfolioId", portfolioId)).collect();
    const out: Array<PositionEarnings & { walletId: string; wallet: string }> = [];
    for (const w of wallets) {
      if (!w.includeInNetWorth) continue;
      const readings = (await ctx.db.query("defiReadings").withIndex("by_wallet_day", (q) => q.eq("walletId", w._id)).order("desc").take(MAX_DAYS)).reverse();
      for (const e of earningsOf(readings)) out.push({ ...e, walletId: w._id, wallet: w.label });
    }
    return out;
  },
});
