import { beforeEach, describe, expect, it } from "vitest";
import { clearAccountLocalData } from "./accountLocalData";
import {
  ACCOUNT_CACHE_QUARANTINE_KEY,
  accountCacheScope,
  accountPortfolioCacheKey
} from "./accountCache";

describe("account local-data cleanup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("removes only the leaving account's namespaced caches and write queue", () => {
    const scopeA = accountCacheScope("user-a", "deployment")!;
    const scopeB = accountCacheScope("user-b", "deployment")!;
    const chatA = accountPortfolioCacheKey(scopeA, "chat", "shared-portfolio");
    const threadA = accountPortfolioCacheKey(
      scopeA,
      "thread",
      "shared-portfolio",
      "2026-08-23"
    );
    const chatB = accountPortfolioCacheKey(scopeB, "chat", "shared-portfolio");
    const threadB = accountPortfolioCacheKey(
      scopeB,
      "thread",
      "shared-portfolio",
      "2026-08-23"
    );
    const keys = [
      "numa:state:user-user-a",
      "numa:onboarding:seen:user-a",
      "numa:onboarding-flow:v2:user-a",
      chatA,
      threadA,
      "numa:csvPreset:portfolio-a",
      "numa:autosnap:portfolio-a:2026-08",
      chatB,
      threadB,
      "numa:csvPreset:portfolio-b",
      "numa:cloud-snapshot:v1:scope-a",
      "numa:cloud-snapshot:v1:scope-b",
      "numa:img:req:dining-merchant",
      "numa:active-money-pod-id",
      "numa:profile:pending",
      "numa:scan-quota:v1",
      "numa:feedback:v1",
      "numa:geocode:v1",
      "numa:onboarding:weeklyTarget",
      "numa:write-queue:v2:deployment:user-a",
      "numa:write-queue:v2:deployment:user-b",
      "numa:write-queue:quarantine:v2:deployment:user-a:recovery-a",
      "numa:write-queue:quarantine:v2:other-deployment:user-a:recovery-a-2",
      "numa:write-queue:quarantine:v2:deployment:user-b:recovery-b",
      "numa:write-queue:quarantine:v1",
      "numa:theme"
    ];
    for (const key of keys) window.localStorage.setItem(key, "saved");
    window.sessionStorage.setItem("numa:onboarding:force", "1");

    const removed = clearAccountLocalData({
      accountId: "user-a",
      clearCurrentSession: true,
      portfolioIds: ["portfolio-a"],
      cloudSnapshotScopes: ["scope-a"],
      storage: window.localStorage,
      sessionStorage: window.sessionStorage
    });

    expect(removed).toContain(chatA);
    expect(window.localStorage.getItem("numa:write-queue:v2:deployment:user-a")).toBeNull();
    expect(window.localStorage.getItem("numa:write-queue:v2:deployment:user-b")).toBe("saved");
    expect(
      window.localStorage.getItem(
        "numa:write-queue:quarantine:v2:deployment:user-a:recovery-a"
      )
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        "numa:write-queue:quarantine:v2:other-deployment:user-a:recovery-a-2"
      )
    ).toBeNull();
    expect(
      window.localStorage.getItem(
        "numa:write-queue:quarantine:v2:deployment:user-b:recovery-b"
      )
    ).toBe("saved");
    expect(window.localStorage.getItem(chatB)).toBe("saved");
    expect(window.localStorage.getItem(threadB)).toBe("saved");
    expect(window.localStorage.getItem("numa:csvPreset:portfolio-b")).toBe("saved");
    expect(window.localStorage.getItem("numa:cloud-snapshot:v1:scope-b")).toBe("saved");
    expect(window.localStorage.getItem("numa:write-queue:quarantine:v1")).toBe("saved");
    expect(window.localStorage.getItem("numa:theme")).toBe("saved");
    expect(window.sessionStorage.getItem("numa:onboarding:force")).toBeNull();
  });

  it("preserves the scoped outbox on sign-out for safe same-account resumption", () => {
    const queueKey = "numa:write-queue:v2:deployment:user-a";
    const quarantineKey =
      "numa:write-queue:quarantine:v2:deployment:user-a:recovery-a";
    window.localStorage.setItem(queueKey, "saved");
    window.localStorage.setItem(quarantineKey, "saved");

    clearAccountLocalData({
      accountId: "user-a",
      preserveWriteQueue: true,
      clearCurrentSession: true,
      storage: window.localStorage,
      sessionStorage: window.sessionStorage
    });

    expect(window.localStorage.getItem(queueKey)).toBe("saved");
    expect(window.localStorage.getItem(quarantineKey)).toBe("saved");
  });

  it("keeps the active session when removing a different cached account", () => {
    window.localStorage.setItem("numa:active-money-pod-id", "pod-for-account-a");
    window.localStorage.setItem("numa:profile:pending", "profile-for-account-a");
    window.localStorage.setItem("numa:onboarding:weeklyTarget", "250");
    window.sessionStorage.setItem("numa:onboarding:force", "1");

    clearAccountLocalData({
      accountId: "user-b",
      storage: window.localStorage,
      sessionStorage: window.sessionStorage
    });

    expect(window.localStorage.getItem("numa:active-money-pod-id")).toBe("pod-for-account-a");
    expect(window.localStorage.getItem("numa:profile:pending")).toBe("profile-for-account-a");
    expect(window.localStorage.getItem("numa:onboarding:weeklyTarget")).toBe("250");
    expect(window.sessionStorage.getItem("numa:onboarding:force")).toBe("1");
  });

  it("removes target legacy transcripts from raw and quarantined cache state", () => {
    window.localStorage.setItem("numa:chat:portfolio-a", "raw-a");
    window.localStorage.setItem("numa:threads:portfolio-a:one", "thread-a");
    window.localStorage.setItem("numa:chat:portfolio-b", "raw-b");
    window.localStorage.setItem(ACCOUNT_CACHE_QUARANTINE_KEY, JSON.stringify([
      { key: "numa:chat:portfolio-a", raw: "quarantined-a", quarantinedAt: 1 },
      { key: "numa:chat:portfolio-b", raw: "quarantined-b", quarantinedAt: 1 }
    ]));

    clearAccountLocalData({
      accountId: "user-a",
      portfolioIds: ["portfolio-a"],
      storage: window.localStorage
    });

    expect(window.localStorage.getItem("numa:chat:portfolio-a")).toBeNull();
    expect(window.localStorage.getItem("numa:threads:portfolio-a:one")).toBeNull();
    expect(window.localStorage.getItem("numa:chat:portfolio-b")).toBe("raw-b");
    expect(JSON.parse(window.localStorage.getItem(ACCOUNT_CACHE_QUARANTINE_KEY)!))
      .toEqual([{ key: "numa:chat:portfolio-b", raw: "quarantined-b", quarantinedAt: 1 }]);
  });

  it("drops an unreadable legacy quarantine when deleting a known portfolio", () => {
    window.localStorage.setItem("numa:chat:portfolio-a", "raw-a");
    window.localStorage.setItem(ACCOUNT_CACHE_QUARANTINE_KEY, "not-json");

    clearAccountLocalData({
      accountId: "user-a",
      portfolioIds: ["portfolio-a"],
      storage: window.localStorage
    });

    expect(window.localStorage.getItem("numa:chat:portfolio-a")).toBeNull();
    expect(window.localStorage.getItem(ACCOUNT_CACHE_QUARANTINE_KEY)).toBeNull();
  });
});
