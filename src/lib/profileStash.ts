/**
 * The account-scoped localStorage stash for profile patches that failed to
 * reach Convex. Pure storage primitives, no React and no auth imports — this
 * module exists so BOTH `profileSync` (stash + replay) and `services/auth`
 * (clear on signOut/delete) can depend on it without forming the
 * profileSync ↔ auth module cycle that produced nondeterministic
 * "useAuth must be used within <AuthProvider>" crashes under Vite HMR.
 */

const PENDING_KEY = "numa:profile:pending";

/**
 * Sentinel id auth.tsx exposes while the cloud profile query is still in
 * flight — never a real account, so never a valid stash owner.
 */
export const CLOUD_LOADING_ID = "cloud-loading";

/**
 * Read the pending patch stashed for `accountId`. A stash owned by another
 * account, or a legacy un-scoped stash (pre account scoping — no way to know
 * whose it was), is discarded so it can never replay onto this account.
 */
export function readPendingProfilePatch(accountId: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const { accountId: owner, patch } = parsed as { accountId?: unknown; patch?: unknown };
      if (owner === accountId && patch && typeof patch === "object") {
        return patch as Record<string, unknown>;
      }
    }
    window.localStorage.removeItem(PENDING_KEY);
    return {};
  } catch {
    return {};
  }
}

/** Merge a failed patch into `accountId`'s stash so later fields win over earlier ones. */
export function mergePendingProfilePatch(
  accountId: string,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...readPendingProfilePatch(accountId), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify({ accountId, patch: next }));
    } catch {
      /* storage full / blocked — the local hooks already hold the choice */
    }
  }
  return next;
}

/** Drop keys that have since been persisted (success or superseded). */
export function clearPendingProfileKeys(accountId: string, keys: string[]): void {
  if (typeof window === "undefined") return;
  const pending = readPendingProfilePatch(accountId);
  let changed = false;
  for (const key of keys) {
    if (key in pending) {
      delete pending[key];
      changed = true;
    }
  }
  if (!changed) return;
  try {
    if (Object.keys(pending).length === 0) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify({ accountId, patch: pending }));
  } catch {
    /* ignore */
  }
}

/**
 * Drop the pending stash entirely. Called on signOut/deleteAccount so a
 * failed write from this session can never replay onto the next account.
 */
export function clearPendingProfileStash(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
