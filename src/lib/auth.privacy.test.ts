import { afterEach, describe, expect, it } from "vitest";
import { loadAuthState, saveAuthState } from "./auth";
afterEach(() => localStorage.removeItem("numa:auth:v1"));
const account = { id: "user", email: "synthetic@example.com", displayName: "Synthetic", defaultCurrency: "EUR" as const, createdAt: 1 };
describe("durable auth metadata excludes profile photo payloads", () => {
  it("strips photo data/capabilities and unknown fields when saving", () => {
    saveAuthState({ accounts: [{ ...account, avatarUrl: "data:image/png;base64,SECRET", unexpected: "SECRET" } as any], currentAccountId: "user" });
    expect(localStorage.getItem("numa:auth:v1")).not.toContain("SECRET");
    expect(loadAuthState()).toEqual({ accounts: [account], currentAccountId: "user" });
  });
  it("removes legacy photos from disk immediately when loading old cached identities", () => {
    localStorage.setItem("numa:auth:v1", JSON.stringify({ accounts: [{ ...account, avatarUrl: "https://legacy.invalid/SECRET" }], currentAccountId: "user" }));
    const loaded = loadAuthState();
    expect(loaded.accounts[0]).not.toHaveProperty("avatarUrl");
    expect(localStorage.getItem("numa:auth:v1")).not.toContain("SECRET");
  });
});
