/**
 * Per-account "have I seen the first-launch tour" flag.
 *
 * Keyed by account id so each profile on the device gets its own onboarding
 * exactly once. The flag lives in localStorage — it is intentionally not
 * synced to the cloud: the tour is purely a UI affordance, not part of the
 * account model, and the first sign-in on a new device is exactly when we
 * want it to fire again.
 */

const PREFIX = "numa:onboarding:seen:";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function key(accountId: string): string {
  return `${PREFIX}${accountId}`;
}

export function hasSeenOnboarding(accountId: string): boolean {
  const store = storage();
  if (!store) return true; // pessimistic: never show if we can't read storage
  try {
    return store.getItem(key(accountId)) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(accountId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key(accountId), "1");
  } catch {
    /* ignore — quota or private mode */
  }
}

export function resetOnboarding(accountId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key(accountId));
  } catch {
    /* ignore */
  }
}
