import type { PendingOnboardingAuth } from "@/lib/onboardingFlow";
import type { AppMode } from "@/lib/appMode";
import type { AppThemeKey } from "@/lib/themeKey";

export type ProfileBootstrapArgs = {
  onboardingCompletedAt?: number;
  appMode?: AppMode;
  themeKey?: AppThemeKey;
};

export function buildReturningProfileBootstrapArgs({
  hasProfile,
  pendingOnboarding,
  completedAt
}: {
  hasProfile: boolean;
  pendingOnboarding: PendingOnboardingAuth | null;
  completedAt: number;
}): ProfileBootstrapArgs {
  if (pendingOnboarding !== null) return {};

  if (!hasProfile) {
    return {
      onboardingCompletedAt: completedAt,
      appMode: "advanced",
      themeKey: "numa"
    };
  }

  return { onboardingCompletedAt: completedAt };
}
