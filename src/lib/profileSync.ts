import { useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/services/auth";
import type { AppMode } from "./appMode";
import type { AppLocale, AppThemeKey, PrimaryJob, StarterTemplate } from "./types";
import type { Theme } from "./theme";

/**
 * Best-effort sync of the user's local preferences (appMode / themeKey /
 * theme / locale) into their Convex profile. Returns true when the cloud write
 * succeeds (or there is nothing to write) and false when the local choice must
 * stand on its own for now because the user is offline or the socket dropped.
 *
 * Pair this with the localStorage-first hooks (`useAppMode`, `useThemeKey`,
 * `useTheme`) so the UI updates synchronously while the cloud catches up.
 *
 * Durability: the write used to be fire-and-forget — navigating or reloading
 * before it committed silently dropped it, so "change language on phone,
 * see it on web" could fail. Now a failed patch is merged into a localStorage
 * stash and replayed the next time this hook mounts (which happens in the app
 * shell and the onboarding flow), so the preference eventually reaches the
 * cloud without coupling this hook to the provider-scoped write queue.
 *
 * Ownership: the stash records which account it belongs to and is only
 * replayed while that same account is signed in. A stash left behind by a
 * different account (or by the pre-scoping format, which had no owner) is
 * discarded rather than written onto whoever signs in next.
 */

// Storage primitives live in profileStash.ts (no React, no auth import) so
// services/auth can clear the stash without a profileSync ↔ auth cycle.
export {
  clearPendingProfileKeys,
  clearPendingProfileStash,
  mergePendingProfilePatch,
  readPendingProfilePatch
} from "./profileStash";
import {
  clearPendingProfileKeys,
  mergePendingProfilePatch,
  readPendingProfilePatch,
  CLOUD_LOADING_ID
} from "./profileStash";

export type ProfilePatch = {
  appMode?: AppMode;
  themeKey?: AppThemeKey;
  theme?: Theme;
  locale?: AppLocale;
  primaryJob?: PrimaryJob;
  starterTemplate?: StarterTemplate;
  onboardingCompletedAt?: number;
};

export function cleanProfilePatch(patch: ProfilePatch): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (patch.appMode !== undefined) clean.appMode = patch.appMode;
  if (patch.themeKey !== undefined) clean.themeKey = patch.themeKey;
  if (patch.theme !== undefined) clean.theme = patch.theme;
  if (patch.locale !== undefined) clean.locale = patch.locale;
  if (patch.primaryJob !== undefined) clean.primaryJob = patch.primaryJob;
  if (patch.starterTemplate !== undefined) clean.starterTemplate = patch.starterTemplate;
  if (patch.onboardingCompletedAt !== undefined) {
    clean.onboardingCompletedAt = patch.onboardingCompletedAt;
  }
  return clean;
}

// Module-level guard so the many components that use this hook don't all fire
// overlapping flushes of the same stash on mount.
let flushInFlight = false;

export function usePushProfile() {
  const updateProfile = useMutation(api.profiles.updateProfile);
  const { currentAccount } = useAuth();
  // No real identity yet (signed out / cloud profile still resolving) — don't
  // read, flush, or stash anything until we know whose stash it would be.
  const accountId =
    currentAccount && currentAccount.id !== CLOUD_LOADING_ID ? currentAccount.id : null;

  // Replay anything a previous session/navigation failed to persist — but only
  // for the account that stashed it. Depends on accountId so an account switch
  // re-evaluates (and a mismatched stash is discarded, not replayed).
  useEffect(() => {
    if (!accountId || flushInFlight) return;
    const pending = readPendingProfilePatch(accountId);
    const keys = Object.keys(pending);
    if (keys.length === 0) return;
    flushInFlight = true;
    updateProfile(pending as Parameters<typeof updateProfile>[0])
      .then(() => clearPendingProfileKeys(accountId, keys))
      .catch(() => {
        /* still offline — leave the stash for the next mount */
      })
      .finally(() => {
        flushInFlight = false;
      });
  }, [accountId, updateProfile]);

  return useCallback(
    async (patch: ProfilePatch) => {
      const clean = cleanProfilePatch(patch);
      const keys = Object.keys(clean);
      if (keys.length === 0) return true;
      try {
        await updateProfile(clean as Parameters<typeof updateProfile>[0]);
        // Success supersedes any stashed value for the same fields.
        if (accountId) clearPendingProfileKeys(accountId, keys);
        return true;
      } catch {
        // Persist so a later mount replays it (for this account only); the
        // local hooks already applied the choice for this device.
        if (accountId) mergePendingProfilePatch(accountId, clean);
        return false;
      }
    },
    [accountId, updateProfile]
  );
}
