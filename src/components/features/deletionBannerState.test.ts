import { describe, expect, it } from "vitest";
import {
  cancellationResultPhase,
  resolveDeletionBannerView
} from "./deletionBannerState";

describe("cancellationResultPhase", () => {
  it("accepts only an exact successful server result", () => {
    expect(cancellationResultPhase({ ok: true })).toBe("canceled");
    expect(cancellationResultPhase(undefined)).toBe("idle");
    expect(cancellationResultPhase({})).toBe("idle");
    expect(cancellationResultPhase({ ok: "true" })).toBe("idle");
  });

  it("preserves only known terminal server failures", () => {
    expect(cancellationResultPhase({ ok: false, reason: "already-started" }))
      .toBe("already-started");
    expect(cancellationResultPhase({ ok: false, reason: "already-deleted" }))
      .toBe("already-deleted");
    expect(cancellationResultPhase({ ok: false, reason: "unexpected" })).toBe("idle");
  });
});

describe("resolveDeletionBannerView", () => {
  it("keeps the pending state honest until cancellation succeeds", () => {
    expect(
      resolveDeletionBannerView({
        phase: "canceling",
        scheduledAt: 100,
        startedAt: null
      })
    ).toBe("canceling");
  });

  it("gives a reactive deletion start precedence over stale cancellation success", () => {
    expect(
      resolveDeletionBannerView({
        phase: "canceled",
        scheduledAt: 100,
        startedAt: 101
      })
    ).toBe("already-started");
  });

  it("shows cancellation success only after the success phase is committed", () => {
    expect(
      resolveDeletionBannerView({
        phase: "canceled",
        scheduledAt: 100,
        startedAt: null
      })
    ).toBe("canceled");
  });
});
