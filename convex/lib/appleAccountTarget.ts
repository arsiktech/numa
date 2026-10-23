import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertExistingAccount } from "./access";

/** Only trusted Apple claims reach this resolver. Subject ownership wins over email.
 * A legacy-only subject stays with its owner even when Apple changes its email. */
export async function resolveAppleAccountTarget(ctx: QueryCtx, subject: string, linkEmail?: string): Promise<Id<"users"> | null> {
  const account = (provider: string) => ctx.db.query("authAccounts")
    .withIndex("providerAndAccountId", q => q.eq("provider", provider).eq("providerAccountId", subject)).unique();
  const [native, legacy] = await Promise.all([account("apple-native"), account("apple")]);
  if (native && legacy && native.userId !== legacy.userId) throw new Error("Apple identity has conflicting account ownership");
  let target = native?.userId ?? legacy?.userId ?? null;
  if (!target && linkEmail) {
    const email = linkEmail.trim().toLowerCase();
    const users = await ctx.db.query("users").withIndex("email", q => q.eq("email", email))
      .filter(q => q.neq(q.field("emailVerificationTime"), undefined)).take(2);
    target = users.length === 1 ? users[0]!._id : null;
  }
  // This is also the pre-exchange boundary. Scheduled grace remains accessible.
  if (target) await assertExistingAccount(ctx, target);
  return target;
}

/** A known pre-exchange account cannot turn into a new signup or a different owner. */
export async function resolvePinnedAppleAccountTarget(ctx: QueryCtx, subject: string, linkEmail: string | undefined, preExchangeUserId: Id<"users"> | null | undefined): Promise<Id<"users"> | null> {
  if (preExchangeUserId === undefined) throw new Error("Missing trusted pre-exchange account decision");
  if (preExchangeUserId !== null) await assertExistingAccount(ctx, preExchangeUserId);
  const current = await resolveAppleAccountTarget(ctx, subject, linkEmail);
  if (preExchangeUserId !== null && current !== preExchangeUserId) throw new Error("Apple sign-in target changed. Try again.");
  return current;
}
