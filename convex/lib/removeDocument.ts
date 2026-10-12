import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireEditor } from "./access";
import { withMutationReceipt, type ReceiptResult } from "./mutationReceipts";

/**
 * Deletion policy for portfolio-scoped documents, in one place:
 * a missing document no-ops; only editors (or owners) may delete; every
 * delete goes through a mutation receipt so client retries can't double-fire.
 *
 * Every portfolio-scoped convex module previously pasted this handler body
 * verbatim (categories, holdings, liabilities, recurring, settlements,
 * wealthSnapshots); keep the policy here so a change lands once.
 */
export async function removePortfolioDocument<T extends TableNames>(
  ctx: MutationCtx,
  id: Id<T>,
  clientMutationId: string | undefined,
  auditLabel: string
): Promise<ReceiptResult<T> | undefined> {
  const existing = await ctx.db.get(id);
  if (!existing) return undefined;
  const { userId } = await requireEditor(
    ctx,
    (existing as unknown as { portfolioId: Id<"portfolios"> }).portfolioId
  );
  return await withMutationReceipt(ctx, userId, clientMutationId, auditLabel, async () => {
    await ctx.db.delete(id);
    return id;
  });
}
