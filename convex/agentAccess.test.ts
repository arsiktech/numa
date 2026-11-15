import { afterEach, describe, expect, it, vi } from "vitest";
import { expireActivity } from "./agentAccess";
import { privacyFixture } from "../src/test/privacyFixture";
afterEach(() => { vi.restoreAllMocks(); });

describe("agent activity retention", () => {
  it("deletes only expired rows, 200 per run, and schedules another run while a backlog remains", async () => {
    const f = privacyFixture(); vi.spyOn(Date, "now").mockReturnValue(1800000000000);
    for (let i = 0; i < 205; i++) f.seed("agentActivity", `expired-${i}`, { expiresAt: 1 });
    f.seed("agentActivity", "fresh", { expiresAt: 1800000000001 });
    expect(await f.call(expireActivity)).toBe(200); expect(f.jobs).toHaveLength(1);
    expect(await f.call(expireActivity)).toBe(5); expect(f.jobs).toHaveLength(1);
    expect(f.all("agentActivity").map(row => row._id)).toEqual(["fresh"]);
  });
});
