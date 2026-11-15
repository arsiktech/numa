// @vitest-environment node
import { describe, expect, it } from "vitest";
import { submit } from "./feedback";
import { privacyFixture } from "../src/test/privacyFixture";

const base = { expectedUserId: "user", kind: "idea", platform: "ios", appVersion: "1.0.0" } as const;
describe("feedback", () => {
  it("stores trimmed feedback for the signed-in account and ignores a retried id", async () => {
    const f = privacyFixture();
    await f.call(submit, { ...base, message: "  Add dark charts  ", clientMutationId: "a" });
    await f.call(submit, { ...base, message: "  Add dark charts  ", clientMutationId: "a" });
    expect(f.all("feedback")).toHaveLength(1);
    expect(f.all("feedback")[0]).toMatchObject({ userId: "user", kind: "idea", message: "Add dark charts", platform: "ios" });
  });
  it("rejects empty, oversized, stale-account, anonymous and deletion-pending feedback", async () => {
    const f = privacyFixture();
    await expect(f.call(submit, { ...base, message: "   ", clientMutationId: "b" })).rejects.toThrow();
    await expect(f.call(submit, { ...base, message: "x".repeat(2001), clientMutationId: "c" })).rejects.toThrow();
    f.seed("users", "other", {}); f.signIn("other");
    await expect(f.call(submit, { ...base, message: "hi", clientMutationId: "d" })).rejects.toThrow();
    f.signIn(null); await expect(f.call(submit, { ...base, message: "hi", clientMutationId: "e" })).rejects.toThrow();
    f.signIn("user"); f.seed("profiles", "profile", { userId: "user", deletionScheduledAt: Date.now() + 1000 });
    await expect(f.call(submit, { ...base, message: "hi", clientMutationId: "f" })).rejects.toThrow();
    expect(f.all("feedback")).toHaveLength(0);
  });
  it("rejects a missing or blank retry id instead of folding every later message into the first", async () => {
    const f = privacyFixture();
    for (const clientMutationId of ["", "   "]) {
      await expect(f.call(submit, { ...base, message: "hi", clientMutationId })).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    }
    await expect(f.call(submit, { ...base, message: "hi", clientMutationId: "x".repeat(201) })).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    await f.call(submit, { ...base, message: "hi", clientMutationId: "  g  " });
    expect(f.all("feedback").map(row => row.clientMutationId)).toEqual(["g"]);
  });
  it("limits one account to ten messages a day", async () => {
    const f = privacyFixture();
    for (let i = 0; i < 10; i++) await f.call(submit, { ...base, message: `m${i}`, clientMutationId: `id${i}` });
    await expect(f.call(submit, { ...base, message: "one more", clientMutationId: "id10" })).rejects.toThrow();
    expect(f.all("feedback")).toHaveLength(10);
  });
});
