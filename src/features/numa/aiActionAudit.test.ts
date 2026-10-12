import { describe, expect, it, vi } from "vitest";
import {
  createAndExecuteConfirmedAiAction,
  executeConfirmedAiAction,
  stableClientMutationId,
  toAiAuditPayload
} from "./aiActionAudit";

describe("AI action audit handoff", () => {
  it("passes the draft into the atomic financial write", async () => {
    const order: string[] = [];
    const result = await executeConfirmedAiAction({
      cloudEnabled: true,
      cloudBacked: true,
      draftId: "draft",
      clientMutationId: "mutation",
      execute: async (draftId) => { order.push(`write:${draftId}`); return "saved"; },
      markFailed: vi.fn()
    });

    expect(result).toBe("saved");
    expect(order).toEqual(["write:draft"]);
  });

  it("fails closed without a cloud audit row and never starts the write", async () => {
    const execute = vi.fn();
    await expect(
      executeConfirmedAiAction({
        cloudEnabled: true,
        cloudBacked: true,
        draftId: undefined,
        clientMutationId: "mutation",
        execute,
        markFailed: vi.fn()
      })
    ).rejects.toThrow(/audit/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("marks the draft failed when the atomic financial write is rejected", async () => {
    const markFailed = vi.fn().mockResolvedValue(undefined);
    await expect(
      executeConfirmedAiAction({
        cloudEnabled: true,
        cloudBacked: true,
        draftId: "draft",
        clientMutationId: "mutation",
        execute: vi.fn().mockRejectedValue(new Error("validation failed")),
        markFailed
      })
    ).rejects.toThrow("validation failed");
    expect(markFailed).toHaveBeenCalledWith("draft", "validation failed");
  });

  it("recovers success when a lost response already committed the atomic write", async () => {
    await expect(
      executeConfirmedAiAction<{ id: string; queued: boolean }>({
        cloudEnabled: true,
        cloudBacked: true,
        draftId: "draft",
        clientMutationId: "mutation",
        execute: vi.fn().mockRejectedValue(new Error("network unavailable")),
        markFailed: vi.fn().mockResolvedValue({
          status: "confirmed",
          resultId: "transaction-1"
        })
      })
    ).resolves.toMatchObject({ id: "transaction-1", queued: false });
  });
});

describe("AI-generated capture audit lifecycle", () => {
  it("reuses one mutation id for the same reviewed row across retries", () => {
    const ids = new Map<string, string>();
    const first = stableClientMutationId(ids, "transaction:row-1", "transactions.add");
    const retry = stableClientMutationId(ids, "transaction:row-1", "transactions.add");
    const second = stableClientMutationId(ids, "transaction:row-2", "transactions.add");

    expect(retry).toBe(first);
    expect(second).not.toBe(first);
    expect(first).toMatch(/^transactions\.add:/);
  });

  it("omits undefined optional fields from Convex audit payloads", () => {
    expect(toAiAuditPayload({ amount: 12, categoryId: undefined, notes: "lunch" })).toEqual({
      amount: 12,
      notes: "lunch"
    });
  });

  it("creates the proposal before handing it to the atomic money mutation", async () => {
    const order: string[] = [];
    await createAndExecuteConfirmedAiAction({
      cloudEnabled: true,
      cloudBacked: true,
      clientMutationId: "mutation",
      createDraft: async () => { order.push("create"); return "draft"; },
      execute: async (draftId) => { order.push(`write:${draftId}`); },
      markFailed: vi.fn()
    });

    expect(order).toEqual(["create", "write:draft"]);
  });

  it("reuses the same audit draft when a partial batch is retried", async () => {
    const attemptState = {};
    const createDraft = vi.fn().mockResolvedValue("draft");
    const execute = vi.fn().mockResolvedValue({ id: "transaction" });
    const input = {
      cloudEnabled: true,
      cloudBacked: true,
      clientMutationId: "stable-mutation",
      createDraft,
      execute,
      markFailed: vi.fn(),
      attemptState
    };

    await createAndExecuteConfirmedAiAction(input);
    await createAndExecuteConfirmedAiAction(input);

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith("draft");
  });

  it("reuses the create request when the first committed response is lost", async () => {
    const attemptState = {};
    let committedDraft: string | undefined;
    const createDraft = vi.fn(async (createRequestId: string) => {
      if (!committedDraft) {
        committedDraft = `draft-for:${createRequestId}`;
        throw new Error("network response lost");
      }
      return committedDraft;
    });
    const input = {
      cloudEnabled: true,
      cloudBacked: true,
      clientMutationId: "transactions.add:stable",
      createDraft,
      execute: vi.fn().mockResolvedValue({ id: "transaction-1" }),
      markFailed: vi.fn(),
      attemptState
    };

    await expect(createAndExecuteConfirmedAiAction(input)).rejects.toThrow("response lost");
    await expect(createAndExecuteConfirmedAiAction(input)).resolves.toEqual({
      id: "transaction-1"
    });
    expect(createDraft).toHaveBeenCalledTimes(2);
    expect(createDraft.mock.calls[0]?.[0]).toBe(createDraft.mock.calls[1]?.[0]);
  });

  it("retains the draft identity when failure reconciliation reports confirmed", async () => {
    const attemptState = { draftId: "draft" };
    await expect(
      createAndExecuteConfirmedAiAction<{ id: string }>({
        cloudEnabled: true,
        cloudBacked: true,
        clientMutationId: "stable-mutation",
        createDraft: vi.fn(),
        execute: vi.fn().mockRejectedValue(new Error("network unavailable")),
        markFailed: vi.fn().mockResolvedValue({
          status: "confirmed",
          resultId: "transaction-1"
        }),
        attemptState
      })
    ).resolves.toMatchObject({ id: "transaction-1" });
    expect(attemptState.draftId).toBe("draft");
  });

  it("never creates an audit row or write against a placeholder portfolio", async () => {
    const createDraft = vi.fn();
    const execute = vi.fn();
    await expect(
      createAndExecuteConfirmedAiAction({
        cloudEnabled: true,
        cloudBacked: false,
        clientMutationId: "mutation",
        createDraft,
        execute,
        markFailed: vi.fn()
      })
    ).rejects.toThrow(/cloud/i);

    expect(createDraft).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
