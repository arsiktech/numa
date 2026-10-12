import { describe, expect, it } from "vitest";
import { status, setAISharing } from "./privacy";
import { AI_SHARING_VERSION } from "./lib/privacyPolicy";
import { privacyFixture } from "../src/test/privacyFixture";

const grant = { expectedUserId: "user", allowed: true, version: AI_SHARING_VERSION, clientMutationId: "grant-1" };
describe("registered AI sharing handlers", () => {
  it("defaults off; requires a current explicit choice and stable receipt", async () => {
    const f = privacyFixture();
    expect(await f.call(status)).toMatchObject({ userId: "user", allowed: false });
    await expect(f.call(setAISharing, { ...grant, version: "old" })).rejects.toThrow(/current AI sharing/);
    await expect(f.call(setAISharing, { ...grant, clientMutationId: " " })).rejects.toThrow(/stable choice/);
    expect(f.all("privacyChoices")).toHaveLength(0);
    await f.call(setAISharing, grant);
    expect(await f.call(status)).toMatchObject({ allowed: true, requiredVersion: AI_SHARING_VERSION });
    expect(await f.call(setAISharing, grant)).toMatchObject({ replayed: true });
    expect(f.all("privacyChoices")).toHaveLength(1);
    expect(f.all("mutationReceipts")).toHaveLength(1);
  });
  it("withdrawal remains possible from old clients; replaying an old grant never regrants", async () => {
    const f = privacyFixture();
    await f.call(setAISharing, grant);
    await f.call(setAISharing, { ...grant, allowed: false, version: "old", clientMutationId: "withdraw-1" });
    expect(await f.call(status)).toMatchObject({ allowed: false });
    expect(await f.call(setAISharing, grant)).toMatchObject({ replayed: true });
    expect(await f.call(status)).toMatchObject({ allowed: false });
    expect(f.all("privacyChoices")).toHaveLength(1);
    expect(f.all("mutationReceipts").map(r => r.scopeId)).toEqual([JSON.stringify([AI_SHARING_VERSION, true]), JSON.stringify([AI_SHARING_VERSION, false])]);
    await expect(f.call(setAISharing, { ...grant, allowed: false })).rejects.toThrow(/different mutation/);
  });
  it("rejects a queued first-execution consent after account switching, not just replays", async () => {
    const f = privacyFixture(); f.seed("users", "other", {}); f.signIn("other");
    await expect(f.call(setAISharing, grant)).rejects.toThrow(/earlier account/);
    expect(f.all("privacyChoices")).toHaveLength(0);
    expect(f.all("mutationReceipts")).toHaveLength(0);
    await f.call(setAISharing, { ...grant, expectedUserId: "other" });
    expect(await f.call(status)).toMatchObject({ userId: "other", allowed: true });
    f.signIn("user"); expect(await f.call(status)).toMatchObject({ allowed: false });
  });
  it("fails closed for stale policies, deleted identities and pending deletion", async () => {
    const f = privacyFixture();
    f.seed("privacyChoices", "choice", { userId: "user", allowed: true, version: "old", recordedAt: 1 });
    expect(await f.call(status)).toMatchObject({ allowed: false });
    await f.call(setAISharing, grant);
    f.seed("profiles", "profile", { userId: "user", deletionScheduledAt: Date.now() + 1000 });
    expect(await f.call(status)).toMatchObject({ allowed: false, deletionPending: true });
    await expect(f.call(setAISharing, { ...grant, clientMutationId: "new" })).rejects.toThrow(/during account deletion/);
    await f.call(setAISharing, { ...grant, allowed: false, clientMutationId: "off" });
    f.rows.delete("user");
    expect(await f.call(status)).toMatchObject({ userId: null, allowed: false });
    await expect(f.call(setAISharing, { ...grant, allowed: false })).rejects.toThrow(/Sign in again/i);
    f.signIn(null); expect(await f.call(status)).toMatchObject({ userId: null, allowed: false });
    await expect(f.call(setAISharing, grant)).rejects.toThrow();
  });
});
