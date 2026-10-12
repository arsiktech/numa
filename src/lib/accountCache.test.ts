import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNT_CACHE_QUARANTINE_KEY,
  accountCacheScope,
  accountPortfolioCacheKey,
  isAccountCacheKeyForOwner,
  quarantineLegacyPortfolioCaches
} from "./accountCache";

describe("account-scoped browser caches", () => {
  beforeEach(() => window.localStorage.clear());

  it("isolates two accounts even when both can access the same portfolio", () => {
    const accountA = accountCacheScope("user-a", "deployment")!;
    const accountB = accountCacheScope("user-b", "deployment")!;
    const keyA = accountPortfolioCacheKey(accountA, "chat", "shared-portfolio");
    const keyB = accountPortfolioCacheKey(accountB, "chat", "shared-portfolio");

    expect(keyA).not.toBe(keyB);
    expect(isAccountCacheKeyForOwner(keyA, "user-a")).toBe(true);
    expect(isAccountCacheKeyForOwner(keyA, "user-b")).toBe(false);
  });

  it("quarantines unscoped chat and thread history instead of assigning it", () => {
    window.localStorage.setItem("numa:chat:portfolio-a", "chat-a");
    window.localStorage.setItem("numa:threads:index:portfolio-a", "index-a");
    window.localStorage.setItem("numa:threads:portfolio-a:2026-08-23", "thread-a");

    expect(quarantineLegacyPortfolioCaches(window.localStorage, "portfolio-a", 123)).toBe(3);
    expect(window.localStorage.getItem("numa:chat:portfolio-a")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(ACCOUNT_CACHE_QUARANTINE_KEY)!)).toEqual(
      expect.arrayContaining([
        { key: "numa:chat:portfolio-a", raw: "chat-a", quarantinedAt: 123 },
        {
          key: "numa:threads:portfolio-a:2026-08-23",
          raw: "thread-a",
          quarantinedAt: 123
        }
      ])
    );
  });
});
