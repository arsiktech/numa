import { describe, expect, it, vi } from "vitest";
import { auditedPayloadMatches, withAiAuditConfirmation } from "./aiAudit";

const input = {
  userId: "user-1",
  portfolioId: "portfolio-1",
  auditDraftId: "draft-1",
  clientMutationId: "mutation-1",
  actionType: "transaction.create" as const,
  actualPayload: { portfolioId: "portfolio-1", amount: 5 },
  payloadKeys: ["portfolioId", "amount"]
};

describe("atomic AI audit confirmation", () => {
  it("confirms with the financial result in the same mutation callback", async () => {
    const patch = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          userId: "user-1",
          portfolioId: "portfolio-1",
          actionType: "transaction.create",
          status: "draft",
          proposedPayload: { portfolioId: "portfolio-1", amount: 5 }
        }),
        patch
      }
    } as any;
    const run = vi.fn().mockResolvedValue({ id: "transaction-1", replayed: false });

    await expect(withAiAuditConfirmation(ctx, input as any, run)).resolves.toEqual({
      id: "transaction-1",
      replayed: false
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(
      "draft-1",
      expect.objectContaining({
        status: "confirmed",
        confirmedMutationId: "mutation-1",
        resultId: "transaction-1"
      })
    );
  });

  it("does not confirm when the financial callback rejects", async () => {
    const patch = vi.fn();
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          userId: "user-1",
          portfolioId: "portfolio-1",
          actionType: "transaction.create",
          status: "draft",
          proposedPayload: { portfolioId: "portfolio-1", amount: 5 }
        }),
        patch
      }
    } as any;

    await expect(
      withAiAuditConfirmation(ctx, input as any, async () => {
        throw new Error("write rejected");
      })
    ).rejects.toThrow("write rejected");
    expect(patch).not.toHaveBeenCalled();
  });

  it("accepts only the same confirmed mutation as an idempotent replay", async () => {
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          userId: "user-1",
          portfolioId: "portfolio-1",
          actionType: "transaction.create",
          status: "confirmed",
          confirmedMutationId: "mutation-1",
          resultId: "transaction-1",
          proposedPayload: { portfolioId: "portfolio-1", amount: 5 }
        }),
        patch: vi.fn()
      }
    } as any;
    const run = vi.fn().mockResolvedValue({ id: "transaction-1", replayed: true });

    await expect(withAiAuditConfirmation(ctx, input as any, run)).resolves.toEqual({
      id: "transaction-1",
      replayed: true
    });
    await expect(
      withAiAuditConfirmation(
        ctx,
        { ...input, clientMutationId: "different" } as any,
        run
      )
    ).rejects.toThrow(/pending|state/i);
  });

  it("rejects a write whose money payload differs from the reviewed proposal", async () => {
    const run = vi.fn();
    const ctx = {
      db: {
        get: vi.fn().mockResolvedValue({
          userId: "user-1",
          portfolioId: "portfolio-1",
          actionType: "transaction.create",
          status: "draft",
          proposedPayload: { portfolioId: "portfolio-1", amount: 5 }
        }),
        patch: vi.fn()
      }
    } as any;

    await expect(
      withAiAuditConfirmation(
        ctx,
        { ...input, actualPayload: { portfolioId: "portfolio-1", amount: 5_000 } } as any,
        run
      )
    ).rejects.toThrow(/payload|match/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("canonicalizes key order but preserves nested financial values", () => {
    expect(auditedPayloadMatches(
      { amount: 5, location: { lng: 2, lat: 1 } },
      { location: { lat: 1, lng: 2 }, amount: 5 },
      ["amount", "location"]
    )).toBe(true);
  });
});
