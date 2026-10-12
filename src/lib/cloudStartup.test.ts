import { describe, expect, it } from "vitest";
import { cloudSnapshotScopeForAccount, shouldShowCloudLoading } from "./cloudStartup";

describe("cloud startup helpers", () => {
  it("can scope a cached snapshot during the cloud-loading account window", () => {
    expect(
      cloudSnapshotScopeForAccount("prod", {
        id: "cloud-loading",
        email: "Owner@Example.com ",
        isCloud: true
      })
    ).toBe("prod|owner@example.com");
  });

  it("does not block shared pod startup when a pod snapshot is already cached", () => {
    expect(
      shouldShowCloudLoading({
        isPodSurface: true,
        portfoliosReady: false,
        podsReady: false,
        cachedPodCount: 1,
        cachedPodDataCount: 1
      })
    ).toBe(false);
  });

  it("keeps portfolio screens gated on both cloud lists", () => {
    expect(
      shouldShowCloudLoading({
        isPodSurface: false,
        portfoliosReady: true,
        podsReady: false,
        cachedPodCount: 1,
        cachedPodDataCount: 1
      })
    ).toBe(true);
  });
});
