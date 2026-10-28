// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { record } from "./activeDays";
import { page as exportPage } from "./dataExport";
import { privacyFixture } from "../src/test/privacyFixture";
import { deleteMyAccount } from "./users";

afterEach(() => vi.useRealTimers());
describe("authenticated daily activity", () => {
  it("records exactly the account and server UTC date; duplicate opens are idempotent", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T23:59:59Z"));
    const f = privacyFixture();
    await f.call(record, { expectedUserId: "user" });
    await f.call(record, { expectedUserId: "user" });
    expect(f.all("activeDays")).toHaveLength(1);
    const { _id, _creationTime, ...data } = f.all("activeDays")[0];
    expect(typeof _id).toBe("string"); expect(typeof _creationTime).toBe("number");
    expect(data).toEqual({ userId: "user", utcDate: "2026-10-28" });
    vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
    await f.call(record, { expectedUserId: "user" });
    expect(f.all("activeDays")).toHaveLength(2);
  });
  it("rejects anonymous, stale account and deletion activity without creating rows", async () => {
    const f = privacyFixture(); f.seed("users", "other", {}); f.signIn("other");
    await expect(f.call(record, { expectedUserId: "user" })).rejects.toThrow();
    f.signIn(null); await expect(f.call(record, { expectedUserId: "user" })).rejects.toThrow();
    f.signIn("user"); f.seed("profiles", "profile", { userId: "user", deletionScheduledAt: Date.now() + 1000 });
    await expect(f.call(record, { expectedUserId: "user" })).rejects.toThrow();
    expect(f.all("activeDays")).toHaveLength(0);
  });
  it("exports the caller's paginated account dates without leaking a fellow member's dates", async () => {
    const f = privacyFixture();
    f.seed("portfolios", "space", { ownerId: "user", name: "Synthetic space", defaultCurrency: "EUR" });
    f.seed("memberships", "member", { userId: "user", portfolioId: "space", role: "owner" });
    f.seed("memberships", "fellow", { userId: "other", portfolioId: "space", role: "editor" });
    f.seed("users", "other", { email: "other@example.com" });
    f.seed("activeDays", "mine", { userId: "user", utcDate: "2026-10-28" });
    f.seed("activeDays", "theirs", { userId: "other", utcDate: "2026-10-28" });
    const args = { expectedUserId: "user", portfolioId: "space", requestId: "synthetic", section: "activeDays", cursor: null, limit: 1 };
    const result = await f.call(exportPage, args);
    expect(JSON.parse(result.rowsJSON).map((r: { _id: string }) => r._id)).toEqual(["mine"]);
    expect(result.isDone).toBe(true);
    f.signIn("other");
    await expect(f.call(exportPage, args)).rejects.toThrow(/account changed/);
  });
  it("erases activity with the existing account deletion lifecycle, not other people's rows", async () => {
    const f = privacyFixture();
    f.seed("activeDays", "mine", { userId: "user", utcDate: "2026-10-28" });
    f.seed("activeDays", "theirs", { userId: "other", utcDate: "2026-10-28" });
    await f.call(deleteMyAccount);
    expect(f.all("activeDays").map(r => r._id)).toEqual(["theirs"]);
  });
});
