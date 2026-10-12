import { describe, expect, it } from "vitest";
import { buildReturningProfileBootstrapArgs } from "./profileBootstrap";

describe("buildReturningProfileBootstrapArgs", () => {
  it("preserves legacy-safe defaults when a returning account has no profile row", () => {
    expect(
      buildReturningProfileBootstrapArgs({
        hasProfile: false,
        pendingOnboarding: null,
        completedAt: 123
      })
    ).toEqual({
      onboardingCompletedAt: 123,
      appMode: "advanced",
      themeKey: "numa"
    });
  });

  it("does not override first-run defaults while onboarding is pending", () => {
    expect(
      buildReturningProfileBootstrapArgs({
        hasProfile: false,
        pendingOnboarding: "provider",
        completedAt: 123
      })
    ).toEqual({});
  });

  it("only marks existing profile rows as onboarded", () => {
    expect(
      buildReturningProfileBootstrapArgs({
        hasProfile: true,
        pendingOnboarding: null,
        completedAt: 123
      })
    ).toEqual({ onboardingCompletedAt: 123 });
  });
});
