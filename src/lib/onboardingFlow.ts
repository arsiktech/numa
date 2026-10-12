/**
 * Tracks whether a user has finished the post-signup onboarding flow
 * (Welcome → Mode → Setup → Home).
 *
 * Mirrors the existing `lib/onboarding.ts` (which gates the in-app multi-card
 * Tour), but is a separate concept: the *Tour* runs once after a user's
 * FIRST in-app session to point at features; the *Flow* runs ONCE between
 * sign-up and first home render to choose a mode and starting preferences.
 *
 * Local state is only the fast cache. Convex profile
 * `onboardingCompletedAt` is the cross-device source of truth for cloud
 * accounts, so returning users do not get pushed through first-run setup on
 * a new browser.
 */

// v2 namespace: the original "numa:onboarding-flow:<id>" key got set on every
// fresh OAuth user by a buggy backfill that mis-read seeded Cash assets as
// "has data". Bumping the key forces those users back through the flow once.
const PREFIX = "numa:onboarding-flow:v2:";
const LEGACY_PREFIX = "numa:onboarding-flow:";
const PENDING_KEY = "numa:onboarding-flow:pending-auth";

export type PendingOnboardingAuth = "signUp" | "provider";

function keyFor(accountId: string): string {
  return `${PREFIX}${accountId}`;
}

/** Clear the pre-v2 flag so it never silently overrides the new check. */
function clearLegacyFlag(accountId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${LEGACY_PREFIX}${accountId}`);
  } catch {
    /* swallow */
  }
}

export function hasCompletedOnboardingFlow(accountId: string | null | undefined): boolean {
  if (!accountId) return true; // can't track without an id — treat as done
  if (typeof window === "undefined") return true;
  try {
    clearLegacyFlag(accountId);
    return window.localStorage.getItem(keyFor(accountId)) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingFlowComplete(accountId: string | null | undefined): void {
  if (!accountId) return;
  if (typeof window === "undefined") return;
  try {
    clearLegacyFlag(accountId);
    window.localStorage.setItem(keyFor(accountId), "1");
    clearPendingOnboardingFlow();
  } catch {
    /* swallow — preference just won't persist */
  }
}

export function markPendingOnboardingFlow(kind: PendingOnboardingAuth): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_KEY, kind);
  } catch {
    /* swallow */
  }
}

export function getPendingOnboardingFlow(): PendingOnboardingAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(PENDING_KEY);
    return value === "signUp" || value === "provider" ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingOnboardingFlow(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* swallow */
  }
}
