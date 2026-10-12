import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { majorUnits, minorUnits } from "./finance";

export function assertAssetBalance(balance: number) {
  if (majorUnits(minorUnits(balance)) !== balance) {
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Asset balance must use whole cents." });
  }
}

/**
 * Shared input guards for the money-pod / mobile surfaces. These were
 * previously copy-pasted (with tiny drift) into moneyPods.ts and mobile.ts;
 * keeping one definition keeps error codes and messages consistent.
 */

export function cleanRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConvexError({ code: "INVALID_INPUT", message: `${label} is required` });
  }
  return trimmed;
}

export function assertPositiveAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ConvexError({
      code: "INVALID_AMOUNT",
      message: "Amount must be greater than zero"
    });
  }
}

export function assertSamePod(
  actualPodId: Id<"moneyPods">,
  expectedPodId: Id<"moneyPods">,
  label: string
) {
  if (String(actualPodId) !== String(expectedPodId)) {
    throw new ConvexError({
      code: "INVALID_REFERENCE",
      message: `${label} does not belong to this money pod`
    });
  }
}

export function assertDistinctSettlementMembers(
  fromMemberId: Id<"podMembers">,
  toMemberId: Id<"podMembers">
) {
  if (String(fromMemberId) === String(toMemberId)) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Settlement payer and recipient must be different"
    });
  }
}

export function normalizeEmail(email: string | undefined | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function isEmailLike(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function displayNameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || email;
}

/** Prefer the stored name unless it looks like a raw email. */
export function friendlyDisplayName(email: string, name?: string | null) {
  const trimmedName = name?.trim();
  if (trimmedName && !trimmedName.includes("@")) return trimmedName;
  return displayNameFromEmail(email) || trimmedName || "You";
}
