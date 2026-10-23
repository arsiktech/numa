import type { Doc } from "../_generated/dataModel";

/** A self-asserted address is display data, never invitation authority. */
export function verifiedInvitationEmail(user: Pick<Doc<"users">, "email" | "emailVerificationTime"> | null) {
  return user?.emailVerificationTime !== undefined && Number.isFinite(user.emailVerificationTime)
    ? user.email?.trim().toLowerCase() || undefined
    : undefined;
}

/** Keep historical participants for balances, but never as withdrawn login grants. */
export function activePodMembership(member: Pick<Doc<"podMembers">, "active" | "removedAt">) {
  return member.active !== false && member.removedAt === undefined;
}
