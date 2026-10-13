import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { isCryptoSymbol, isUsEquitySymbol } from "./marketQuoteProviders";

declare const process: { env: Record<string, string | undefined> };

const FRESH_MS = 15 * 60 * 1000;

/**
 * A newly saved holding shouldn't wait for the next 15-minute run to get its price. When its symbol
 * can be priced and has no recent quote, fetch quotes now.
 */
export async function refreshQuoteSoon(ctx: MutationCtx, symbol: string): Promise<void> {
  // Test backends seed their own prices and set this, so nothing live overwrites them.
  if (process.env.NUMA_QUOTES_OFFLINE) return;
  if (!isCryptoSymbol(symbol) && !isUsEquitySymbol(symbol)) return;
  const quote = await ctx.db.query("marketQuotes").withIndex("by_symbol", (q) => q.eq("symbol", symbol)).unique();
  if (quote && Date.now() - quote.updatedAt < FRESH_MS) return;
  await ctx.scheduler.runAfter(0, internal.marketQuotes.refreshQuotes, {});
}
