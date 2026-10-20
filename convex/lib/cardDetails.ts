import { ConvexError, v } from "convex/values";

const amountIn = v.object({ amount: v.number(), currency: v.string() });
/** A card purchase as the card's statement has it: which card, the merchant, what was charged and the cashback. */
export const cardDetailsValidator = v.object({
  issuer: v.string(),
  last4: v.optional(v.string()),
  merchant: v.optional(v.string()),
  mcc: v.optional(v.string()),
  mccName: v.optional(v.string()),
  /** What it cost where it was bought, when that currency is neither the amount's nor the charge's. */
  original: v.optional(amountIn),
  billed: v.optional(amountIn),
  cashback: v.optional(amountIn),
  mode: v.optional(v.string()),
  status: v.optional(v.string()),
});
export type CardDetails = typeof cardDetailsValidator.type;

const short = (s: string | undefined, max: number) => (s === undefined ? undefined : s.trim().slice(0, max) || undefined);
const money = (m: { amount: number; currency: string } | undefined, field: string) => {
  if (!m) return undefined;
  const currency = m.currency.trim().toUpperCase();
  if (!Number.isFinite(m.amount) || m.amount < 0 || !/^[A-Z]{3,6}$/.test(currency)) throw new ConvexError({ code: "INVALID_CARD_DETAILS", message: `${field} needs a positive amount and a currency code` });
  return { amount: Math.round(m.amount * 1e6) / 1e6, currency };
};
/** Card details, trimmed and checked. Unknown values stay out rather than becoming zero. */
export function cleanCardDetails(card: CardDetails): CardDetails {
  // Checked whole, never cut: a longer number must be refused, not shortened into four digits.
  const last4 = card.last4?.trim() || undefined;
  if (last4 !== undefined && !/^\d{4}$/.test(last4)) throw new ConvexError({ code: "INVALID_CARD_DETAILS", message: "last4 is the card's last four digits" });
  const out: CardDetails = {
    issuer: short(card.issuer, 60) ?? "Card", last4, merchant: short(card.merchant, 160), mcc: short(card.mcc, 8), mccName: short(card.mccName, 120),
    original: money(card.original, "original"), billed: money(card.billed, "billed"), cashback: money(card.cashback, "cashback"), mode: short(card.mode, 40), status: short(card.status, 30),
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as CardDetails;
}
