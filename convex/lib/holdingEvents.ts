import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** A holding's buy and sell history goes with it: no event may outlive its holding. */
export async function deleteHoldingEvents(ctx: MutationCtx, holdingId: Id<"holdings">) {
  const events = await ctx.db
    .query("holdingEvents")
    .withIndex("by_holding", (q) => q.eq("holdingId", holdingId))
    .collect();
  for (const event of events) await ctx.db.delete(event._id);
}
