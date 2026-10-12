import { describe, expect, it, vi } from "vitest";
import {
  createAiActionDraft,
  redraftFailedAiAction,
  rejectStandaloneAiActionConfirmation,
  shouldMarkAiActionFailed,
  updatePendingAiActionProposal
} from "./aiActions";

describe("AI audit draft-create idempotency", () => {
  it("reuses one draft after a committed response is lost", async () => {
    let existing: Record<string, unknown> | null = null;
    const insert = vi.fn(async (_table, value) => {
      existing = { _id: "draft-1", ...value };
      return "draft-1";
    });
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({ unique: vi.fn(async () => existing) }))
        })),
        insert
      }
    } as any;
    const args = {
      portfolioId: "portfolio-1" as any,
      actionType: "transaction.create" as const,
      prompt: "Receipt review: coffee",
      proposedPayload: { description: "Coffee", amount: 4.5 },
      createRequestId: "audit:transactions.add:stable"
    };

    await expect(createAiActionDraft(ctx, "user-1" as any, args))
      .resolves.toBe("draft-1");
    await expect(createAiActionDraft(ctx, "user-1" as any, args))
      .resolves.toBe("draft-1");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of a create request for another proposal", async () => {
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({
            unique: vi.fn().mockResolvedValue({
              _id: "draft-1",
              userId: "user-1",
              portfolioId: "portfolio-1",
              actionType: "transaction.create",
              prompt: "Receipt review: coffee",
              proposedPayload: { description: "Coffee", amount: 4.5 }
            })
          }))
        })),
        insert: vi.fn()
      }
    } as any;

    await expect(createAiActionDraft(ctx, "user-1" as any, {
      portfolioId: "portfolio-1" as any,
      actionType: "transaction.create",
      prompt: "Receipt review: taxi",
      proposedPayload: { description: "Taxi", amount: 20 },
      createRequestId: "audit:transactions.add:stable"
    })).rejects.toThrow(/another reviewed action/i);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});

describe("AI audit terminal-state guard", () => {
  it("never demotes an atomically confirmed draft to failed", () => {
    expect(shouldMarkAiActionFailed("draft")).toBe(true);
    expect(shouldMarkAiActionFailed("confirmed")).toBe(false);
    expect(shouldMarkAiActionFailed("cancelled")).toBe(false);
    expect(shouldMarkAiActionFailed("failed")).toBe(false);
  });

  it("fails closed when a stale client calls standalone confirmation", () => {
    expect(() => rejectStandaloneAiActionConfirmation()).toThrow(/audited financial mutation/i);
  });
});

describe("AI audit redraft idempotency", () => {
  const source = {
    _id: "draft-failed",
    userId: "user-1",
    portfolioId: "portfolio-1",
    actionType: "transaction.create",
    status: "failed",
    prompt: "reviewed coffee",
    proposedPayload: { amount: 3.5 }
  };

  it("reuses one linked draft for the same retry request", async () => {
    let existing: Record<string, unknown> | null = null;
    const insert = vi.fn(async (_table, value) => {
      existing = { _id: "draft-retry", ...value };
      return "draft-retry";
    });
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue(source),
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({ unique: vi.fn(async () => existing) }))
        })),
        insert
      }
    } as any;
    const args = {
      id: "draft-failed" as any,
      retryRequestId: "redraft:queue-1:draft-failed"
    };

    await expect(redraftFailedAiAction(ctx, "user-1" as any, args)).resolves.toBe(
      "draft-retry"
    );
    await expect(redraftFailedAiAction(ctx, "user-1" as any, args)).resolves.toBe(
      "draft-retry"
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      "aiActionDrafts",
      expect.objectContaining({
        retryOfDraftId: "draft-failed",
        retryRequestId: args.retryRequestId
      })
    );
  });

  it("rejects reuse of a retry request for another failed source", async () => {
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({ ...source, _id: "draft-other" }),
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({
            unique: vi.fn().mockResolvedValue({
              _id: "draft-retry",
              retryOfDraftId: "draft-failed"
            })
          }))
        })),
        insert: vi.fn()
      }
    } as any;

    await expect(redraftFailedAiAction(ctx, "user-1" as any, {
      id: "draft-other" as any,
      retryRequestId: "same-request"
    })).rejects.toThrow(/another reviewed action/i);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});

describe("AI audit proposal synchronization", () => {
  it("updates only the owner's still-pending draft", async () => {
    const patch = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          _id: "draft-1",
          userId: "user-1",
          status: "draft",
          proposedPayload: { amount: 4 }
        }),
        patch
      }
    } as any;

    await expect(updatePendingAiActionProposal(ctx, "user-1" as any, {
      id: "draft-1" as any,
      prompt: "Voice review: coffee",
      proposedPayload: { amount: 4.5 }
    })).resolves.toEqual({ id: "draft-1", status: "draft" });
    expect(patch).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      prompt: "Voice review: coffee",
      proposedPayload: { amount: 4.5 }
    }));
  });

  it("recovers a confirmed exact proposal without mutating it", async () => {
    const patch = vi.fn();
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          _id: "draft-1",
          userId: "user-1",
          status: "confirmed",
          resultId: "transaction-1",
          proposedPayload: { amount: 4.5, description: "Coffee" }
        }),
        patch
      }
    } as any;

    await expect(updatePendingAiActionProposal(ctx, "user-1" as any, {
      id: "draft-1" as any,
      prompt: "Voice review: coffee",
      proposedPayload: { description: "Coffee", amount: 4.5 }
    })).resolves.toEqual({
      id: "draft-1",
      status: "confirmed",
      resultId: "transaction-1"
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it("reports a failed draft so the client can redraft it idempotently", async () => {
    const patch = vi.fn();
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          _id: "draft-failed",
          userId: "user-1",
          status: "failed",
          proposedPayload: { amount: 4.5 }
        }),
        patch
      }
    } as any;

    await expect(updatePendingAiActionProposal(ctx, "user-1" as any, {
      id: "draft-failed" as any,
      prompt: "Voice review: coffee",
      proposedPayload: { amount: 4.5 }
    })).resolves.toEqual({ id: "draft-failed", status: "failed" });
    expect(patch).not.toHaveBeenCalled();
  });
});
