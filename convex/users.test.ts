import { describe, expect, it } from "vitest";
import { deletionCancellationDecision } from "./users";

describe("account deletion cancellation boundary", () => {
  it("allows cancellation only before the first destructive chunk starts", () => {
    expect(deletionCancellationDecision({})).toBe("cancelable");
    expect(deletionCancellationDecision({ deletionStartedAt: 1_800_000_000_000 }))
      .toBe("already-started");
    expect(deletionCancellationDecision(null)).toBe("already-deleted");
  });
});
