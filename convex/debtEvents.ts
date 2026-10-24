import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireEditor, requireMember } from "./lib/access";
import { interestAddProblem } from "./lib/loanAccrual";
import { cleanSplit, roundAmount } from "./lib/loanTerms";
import { withMutationReceipt } from "./lib/mutationReceipts";

const kindValidator = v.union(v.literal("borrowed"), v.literal("repaid"), v.literal("lent"), v.literal("received"), v.literal("note"), v.literal("capitalized"));
type Kind = Doc<"debtEvents">["kind"];
const DAY = 86_400_000;
const bad = (message: string) => new ConvexError({ code: "INVALID_DEBT_EVENT", message });
const cents = (n: number) => Math.round(n * 100) / 100;

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    const rows = await ctx.db.query("debtEvents").withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId)).collect();
    return rows.map((r) => ({ id: r._id, subject: r.subject, kind: r.kind, amount: r.amount ?? null, unit: r.unit ?? null, principalPart: r.principalPart ?? null, interestPart: r.interestPart ?? null, feePart: r.feePart ?? null, applied: r.applied, occurredAt: r.occurredAt, note: r.note ?? null }));
  }
});

type Record = { table: "liabilities"; doc: Doc<"liabilities"> } | { table: "assets"; doc: Doc<"assets"> };

/** The debt an event is about: a recorded debt, or money owed to the person. */
async function recordOf(ctx: MutationCtx, portfolioId: Id<"portfolios">, subject: string): Promise<Record | null> {
  const [kind, raw, ...rest] = subject.split(":");
  if (rest.length || !raw) return null;
  if (kind === "liability") {
    const id = ctx.db.normalizeId("liabilities", raw);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && String(doc.portfolioId) === String(portfolioId) ? { table: "liabilities", doc } : null;
  }
  if (kind === "asset") {
    const id = ctx.db.normalizeId("assets", raw);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && String(doc.portfolioId) === String(portfolioId) ? { table: "assets", doc } : null;
  }
  return null;
}

/** The unit an event is in must be the one the record is kept in, whether or not it changes the balance. */
function assertUnit(record: Record, unit: string) {
  if (record.table === "liabilities") {
    const d = record.doc;
    if (d.owedSymbol && d.owedQuantity !== undefined) {
      if (unit.toUpperCase() !== d.owedSymbol.toUpperCase()) throw bad(`This debt is owed in ${d.owedSymbol}`);
      return;
    }
    if (unit !== d.currency) throw bad(`This debt is in ${d.currency}`);
    return;
  }
  if (unit !== record.doc.currency) throw bad(`This is in ${record.doc.currency}`);
}

/**
 * Interest added to the principal can be no more than was owed on its date, worked out from the terms
 * and this debt's history up to it, and adding it must not leave today's total owed below zero.
 * Added interest settles the oldest months, so a second add of the same interest, from another phone,
 * another call or an earlier date, finds nothing left and is refused. The server has no time zone to
 * go by, and the app counts the phone's own calendar day, which can be a day and a few hours ahead of
 * the server's clock. So today counts a month that completes within the next two days: the most it can
 * allow beyond what the app showed.
 */
async function assertWithinInterestOwed(ctx: MutationCtx, loan: Doc<"liabilities">, portfolioId: Id<"portfolios">, subject: string, amount: number, at: number) {
  if (loan.principal === undefined || loan.startedAt === undefined || !loan.interestRate) throw bad("There is no unpaid interest to add yet");
  const history = await ctx.db.query("debtEvents").withIndex("by_subject", (q) => q.eq("portfolioId", portfolioId).eq("subject", subject)).collect();
  const problem = interestAddProblem({ principal: loan.principal, startedAt: loan.startedAt, interestRate: loan.interestRate }, history, amount, at, Date.now() + 2 * DAY);
  if (problem) throw bad(problem.startsWith("That is more") ? `${problem} ${loan.currency}` : problem);
}

/**
 * Moves a record's balance by an event: money taken or lent adds, money paid back or received takes
 * away, and interest added to the principal adds. A debt owed in a coin moves in that coin and keeps its last price for its value.
 */
async function applyTo(ctx: MutationCtx, record: Record, kind: Kind, amount: number, unit: string, sign: 1 | -1) {
  const grows = kind === "borrowed" || kind === "lent" || kind === "capitalized";
  const delta = (grows ? amount : -amount) * sign;
  if (record.table === "liabilities") {
    const d = record.doc;
    if (d.owedSymbol && d.owedQuantity !== undefined) {
      if (unit.toUpperCase() !== d.owedSymbol.toUpperCase()) throw bad(`This debt is owed in ${d.owedSymbol}`);
      const quantity = Math.round((d.owedQuantity + delta) * 1e8) / 1e8;
      if (quantity < 0) throw bad("That is more than is owed");
      const price = d.owedQuantity > 0 ? d.balance / d.owedQuantity : 0;
      await ctx.db.patch(d._id, { owedQuantity: quantity, balance: cents(quantity * price), updatedAt: Date.now() });
      return;
    }
    if (unit !== d.currency) throw bad(`This debt is in ${d.currency}`);
    const balance = cents(d.balance + delta);
    if (balance < 0) throw bad("That is more than is owed");
    await ctx.db.patch(d._id, { balance, updatedAt: Date.now() });
    return;
  }
  const d = record.doc;
  if (unit !== d.currency) throw bad(`This is in ${d.currency}`);
  const balance = cents(d.balance + delta);
  if (balance < 0) throw bad("That is more than is owed to you");
  await ctx.db.patch(d._id, { balance, updatedAt: Date.now() });
}

/**
 * Records what happened to a debt. With `apply`, a payment or a new amount also changes the debt
 * itself, in one write, so the history and the balance never disagree.
 */
export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    subject: v.string(),
    kind: kindValidator,
    amount: v.optional(v.number()),
    unit: v.optional(v.string()),
    occurredAt: v.number(),
    note: v.optional(v.string()),
    /** How a payment divides. Left out, the whole amount is principal. When given, the parts add up to the amount. */
    principalPart: v.optional(v.number()),
    interestPart: v.optional(v.number()),
    feePart: v.optional(v.number()),
    apply: v.boolean(),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const record = await recordOf(ctx, args.portfolioId, args.subject);
    if (!record) throw new ConvexError({ code: "NOT_FOUND", message: "That debt isn't in this space" });
    const owedToYou = record.table === "assets";
    if (owedToYou && !record.doc.owedBy) throw bad("Mark who owes this money first");
    if (args.kind !== "note" && (owedToYou ? !["lent", "received"].includes(args.kind) : !["borrowed", "repaid", "capitalized"].includes(args.kind))) {
      throw bad(owedToYou ? "Money owed to you is lent or received" : "A debt is borrowed, repaid or has interest added");
    }
    const note = args.note?.trim().replace(/\s+/g, " ") || undefined;
    if (note && note.length > 140) throw bad("Keep the note to 140 characters");
    if (!Number.isFinite(args.occurredAt) || args.occurredAt > Date.now() + DAY) throw bad("The date can't be in the future");
    const hasAmount = args.amount !== undefined;
    if (args.kind === "note" ? hasAmount || args.apply || !note : !hasAmount) throw bad(args.kind === "note" ? "A note has text and no amount" : "Say how much");
    if (hasAmount && (!Number.isFinite(args.amount) || !(args.amount! > 0) || args.amount! > 1e12)) throw bad("The amount must be positive");
    const unit = args.unit?.trim();
    if (hasAmount && (!unit || !/^[A-Za-z0-9.]{1,24}$/.test(unit))) throw bad("Say which currency or coin");
    // The amount is kept to cents (or eight decimals for a coin), so Undo gives back exactly what was taken.
    const amount = hasAmount ? roundAmount(args.amount!, unit!) : undefined;
    if (hasAmount && !(amount! > 0)) throw bad("That amount is too small to record");
    if (hasAmount) assertUnit(record, unit!);
    // Interest can be added only to a loan whose terms say how it accrues, so there is a rate behind the amount.
    if (args.kind === "capitalized" && !(record.table === "liabilities" && record.doc.interestTerms === "simple")) throw bad("Interest can only be added to a loan with simple interest terms");
    // A payment can divide into principal, interest and fees. Only the principal part changes what is owed.
    const hasParts = args.principalPart !== undefined || args.interestPart !== undefined || args.feePart !== undefined;
    if (hasParts && !hasAmount) throw bad("A split needs an amount");
    if (hasParts && args.kind !== "repaid" && args.kind !== "received") throw bad("Only a payment can be split into principal, interest and fees");
    const split = hasAmount ? cleanSplit(amount!, unit!, { principalPart: args.principalPart, interestPart: args.interestPart, feePart: args.feePart }) : null;
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "debtEvents.add", async (): Promise<Id<"debtEvents">> => {
      // Checked inside the receipt, so a replay of an add that already went through returns that add and is not refused for having used up the interest.
      if (args.kind === "capitalized" && record.table === "liabilities") await assertWithinInterestOwed(ctx, record.doc, args.portfolioId, args.subject, amount!, args.occurredAt);
      const balanceAmount = split ? split.principalPart : amount!;
      if (args.apply && hasAmount && balanceAmount > 0) await applyTo(ctx, record, args.kind, balanceAmount, unit!, 1);
      return await ctx.db.insert("debtEvents", {
        portfolioId: args.portfolioId, subject: args.subject, kind: args.kind, applied: args.apply && hasAmount,
        occurredAt: args.occurredAt, createdAt: Date.now(),
        ...(hasAmount ? { amount, unit } : {}), ...(split ?? {}), ...(note ? { note } : {})
      });
    }, args.portfolioId);
  }
});

/** Removes an event. One that changed the debt gives that amount back, so Undo restores the balance. */
export const remove = mutation({
  args: { id: v.id("debtEvents"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) return null;
    const { userId } = await requireEditor(ctx, event.portfolioId);
    return await withMutationReceipt(ctx, userId, args.clientMutationId, "debtEvents.remove", async () => {
      const record = await recordOf(ctx, event.portfolioId, event.subject);
      // A split payment changed the balance by its principal part only, so only that comes back.
      const balanceAmount = event.principalPart ?? event.amount;
      if (event.applied && record && balanceAmount !== undefined && balanceAmount > 0 && event.unit) await applyTo(ctx, record, event.kind, balanceAmount, event.unit, -1);
      await ctx.db.delete(args.id);
      return args.id;
    }, event.portfolioId);
  }
});
