import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  auditedRetryIds,
  buildExecutors,
  isQueuedWriteDue,
  isTransientWriteError,
  loadWriteQueueForScope,
  markQueuedWriteStatus,
  MAX_QUEUED_WRITE_ATTEMPTS,
  nextQueuedWriteDelayMs,
  pendingQueueSignature,
  readDeviceWriteQueueRecovery,
  readScopedWriteQueueRecovery,
  queuedWriteRetryDelayMs,
  saveWriteQueueForScope,
  upsertQueuedWrite,
  useWriteQueue,
  writeQueueScopeForAccount,
  writeQueueStorageKey,
  WriteQueueProvider,
  WRITE_QUEUE_DEPLOYMENT,
  WRITE_QUEUE_LEGACY_KEY,
  WRITE_QUEUE_QUARANTINE_KEY,
  WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX,
  type QueuedWriteOperation
} from "./writeQueue";

const cloudMocks = vi.hoisted(() => ({
  mutations: {} as Record<string, (payload: unknown) => Promise<unknown>>,
  accountId: "user-a"
}));

vi.mock("./cloudStore", () => ({
  useCloudState: () => ({ enabled: true }),
  useCloudMutations: () => cloudMocks.mutations
}));

vi.mock("./auth", () => ({
  useAuth: () => ({
    currentAccount: {
      id: cloudMocks.accountId,
      email: `${cloudMocks.accountId}@example.com`,
      isCloud: true
    }
  })
}));

const SCOPE_A = { ownerId: "user-a", deployment: "test-deployment" };
const SCOPE_B = { ownerId: "user-b", deployment: "test-deployment" };

describe("write queue", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps operations ordered by creation time", () => {
    let items: QueuedWriteOperation[] = [];
    items = upsertQueuedWrite(SCOPE_A, items, "transactions.add", {}, { clientMutationId: "b", now: 200 }).items;
    items = upsertQueuedWrite(SCOPE_A, items, "categories.add", {}, { clientMutationId: "a", now: 100 }).items;
    expect(items.map((item) => item.clientMutationId)).toEqual(["a", "b"]);
  });

  it("dedupes by clientMutationId for idempotent replay", () => {
    let items: QueuedWriteOperation[] = [];
    const first = upsertQueuedWrite(SCOPE_A, items, "transactions.add", { amount: 10 }, { clientMutationId: "same", now: 100 });
    items = first.items;
    const second = upsertQueuedWrite(SCOPE_A, items, "transactions.add", { amount: 20 }, { clientMutationId: "same", now: 200 });
    expect(second.items).toHaveLength(1);
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.payload.amount).toBe(20);
    expect(second.item.createdAt).toBe(100);
    expect(second.item.updatedAt).toBe(200);
  });

  it("tracks retry attempts and failure state", () => {
    let items = upsertQueuedWrite(SCOPE_A, [], "transactions.add", {}, { clientMutationId: "retry", now: 100 }).items;
    items = markQueuedWriteStatus(items, items[0]!.id, "syncing", {
      now: 150,
      incrementAttempts: true
    });
    items = markQueuedWriteStatus(items, items[0]!.id, "failed", {
      now: 200,
      error: "Network timeout"
    });
    expect(items[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "Network timeout",
      updatedAt: 200
    });
    expect(isTransientWriteError(new Error("Network timeout"))).toBe(true);
    expect(isTransientWriteError(new Error("Validation failed"))).toBe(false);
  });

  it("auto flush signatures ignore failed writes to avoid immediate retry loops", () => {
    let items = upsertQueuedWrite(SCOPE_A, [], "transactions.add", {}, { clientMutationId: "retry", now: 100 }).items;
    expect(pendingQueueSignature(items)).toContain("retry");

    items = markQueuedWriteStatus(items, items[0]!.id, "syncing", {
      now: 150,
      incrementAttempts: true
    });
    expect(pendingQueueSignature(items)).toBe("");

    items = markQueuedWriteStatus(items, items[0]!.id, "failed", {
      now: 200,
      error: "Network timeout"
    });
    expect(pendingQueueSignature(items)).toBe("");
  });

  it("registers the shared-pod settlement update executor for queued replay", async () => {
    const calls: unknown[] = [];
    const executors = buildExecutors({
      updatePodSettlement: async (payload: unknown) => {
        calls.push(payload);
        return { id: "settlement" };
      }
    } as any);

    await expect(
      executors["moneyPods.updateSettlement"]?.({ settlementId: "ps1", amount: 12 })
    ).resolves.toEqual({ id: "settlement" });
    expect(calls).toEqual([{ settlementId: "ps1", amount: 12 }]);
  });

  it("registers the shared-pod leave executor for offline replay", async () => {
    const leaveMoneyPod = vi.fn().mockResolvedValue({ id: "pod" });
    const executors = buildExecutors({ leaveMoneyPod } as any);

    await expect(
      executors["moneyPods.leaveMoneyPod"]?.({ podId: "pod" })
    ).resolves.toEqual({ id: "pod" });
    expect(leaveMoneyPod).toHaveBeenCalledWith({ podId: "pod" });
  });

  it("registers wallet update and remove executors for queued replay", async () => {
    const calls: unknown[] = [];
    const executors = buildExecutors({
      updateCryptoWallet: async (payload: unknown) => {
        calls.push(["update", payload]);
        return { id: "wallet" };
      },
      removeCryptoWallet: async (payload: unknown) => {
        calls.push(["remove", payload]);
        return { id: "wallet" };
      }
    } as any);

    await executors["cryptoWallets.update"]?.({ id: "cw1", patch: { label: "Cold" } });
    await executors["cryptoWallets.remove"]?.({ id: "cw1" });
    expect(calls).toEqual([
      ["update", { id: "cw1", patch: { label: "Cold" } }],
      ["remove", { id: "cw1" }]
    ]);
  });

  it("computes bounded exponential retry backoff", () => {
    expect(queuedWriteRetryDelayMs(0)).toBe(0);
    expect(queuedWriteRetryDelayMs(1)).toBe(2_000);
    expect(queuedWriteRetryDelayMs(2)).toBe(4_000);
    expect(queuedWriteRetryDelayMs(3)).toBe(8_000);
    expect(queuedWriteRetryDelayMs(20)).toBe(5 * 60 * 1000);
  });

  it("only considers pending writes due, honouring elapsed-time backoff", () => {
    const fresh = upsertQueuedWrite(SCOPE_A, [], "transactions.add", {}, { clientMutationId: "due", now: 1_000 })
      .items[0]!;
    expect(isQueuedWriteDue(fresh, 1_000)).toBe(true);

    const retried = { ...fresh, attempts: 1, updatedAt: 1_000 };
    expect(isQueuedWriteDue(retried, 1_500)).toBe(false);
    expect(isQueuedWriteDue(retried, 3_001)).toBe(true);
    expect(isQueuedWriteDue({ ...retried, status: "failed" as const }, 999_999)).toBe(false);
  });

  it("computes the next automatic retry instead of waiting for a focus event", () => {
    const first = upsertQueuedWrite(
      SCOPE_A,
      [],
      "transactions.add",
      {},
      { clientMutationId: "first", now: 1_000 }
    ).item;
    const retried = { ...first, attempts: 2, updatedAt: 2_000 };

    expect(nextQueuedWriteDelayMs([retried], 2_500)).toBe(3_500);
    expect(nextQueuedWriteDelayMs([{ ...retried, status: "failed" }], 2_500)).toBeNull();
  });

  it("restores an interrupted syncing write as pending for receipt-safe replay", () => {
    const interrupted: QueuedWriteOperation = {
      id: "wq_interrupted",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-interrupted" },
      clientMutationId: "cm-interrupted",
      status: "syncing",
      attempts: 1,
      createdAt: 1,
      updatedAt: 2,
      ownerId: SCOPE_A.ownerId,
      deployment: SCOPE_A.deployment
    };
    window.localStorage.setItem(
      `numa:write-queue:v2:${encodeURIComponent(SCOPE_A.deployment)}:${encodeURIComponent(SCOPE_A.ownerId)}`,
      JSON.stringify([interrupted])
    );

    expect(loadWriteQueueForScope(window.localStorage, SCOPE_A)[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      clientMutationId: "cm-interrupted"
    });
  });

  it("binds every queued write to the creating account and Convex deployment", () => {
    const queued = upsertQueuedWrite(
      SCOPE_A,
      [],
      "transactions.add",
      { amount: 12 },
      { clientMutationId: "owned", auditDraftId: "draft-owned", now: 100 }
    ).item;

    expect(queued).toMatchObject({ ...SCOPE_A, auditDraftId: "draft-owned" });
    saveWriteQueueForScope(window.localStorage, SCOPE_A, [queued]);
    expect(loadWriteQueueForScope(window.localStorage, SCOPE_A)).toHaveLength(1);
    expect(loadWriteQueueForScope(window.localStorage, SCOPE_B)).toEqual([]);
  });

  it("quarantines the legacy unowned queue instead of adopting it", () => {
    const legacy = [{
      id: "legacy",
      operation: "portfolios.create",
      payload: { clientMutationId: "legacy-create" },
      clientMutationId: "legacy-create",
      status: "pending",
      attempts: 0,
      createdAt: 1,
      updatedAt: 1
    }];
    window.localStorage.setItem(WRITE_QUEUE_LEGACY_KEY, JSON.stringify(legacy));

    expect(loadWriteQueueForScope(window.localStorage, SCOPE_A)).toEqual([]);
    expect(window.localStorage.getItem(WRITE_QUEUE_LEGACY_KEY)).toBeNull();
    expect(window.localStorage.getItem(WRITE_QUEUE_QUARANTINE_KEY)).toBe(
      JSON.stringify(legacy)
    );
  });

  it("merges a newer legacy queue into an existing quarantine before removing it", () => {
    const older = [{ clientMutationId: "older" }];
    const newer = [{ clientMutationId: "newer" }];
    window.localStorage.setItem(WRITE_QUEUE_QUARANTINE_KEY, JSON.stringify(older));
    window.localStorage.setItem(WRITE_QUEUE_LEGACY_KEY, JSON.stringify(newer));

    loadWriteQueueForScope(window.localStorage, SCOPE_A);

    expect(JSON.parse(window.localStorage.getItem(WRITE_QUEUE_QUARANTINE_KEY)!)).toEqual([
      ...older,
      ...newer
    ]);
    expect(window.localStorage.getItem(WRITE_QUEUE_LEGACY_KEY)).toBeNull();
  });

  it("quarantines the exact scoped raw before replacing malformed queue state", () => {
    const key = `numa:write-queue:v2:${encodeURIComponent(SCOPE_A.deployment)}:${encodeURIComponent(SCOPE_A.ownerId)}`;
    const raw = "{not-json";
    window.localStorage.setItem(key, raw);

    expect(loadWriteQueueForScope(window.localStorage, SCOPE_A)).toEqual([]);

    const recoveryKey = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index)
    ).find((candidate) => candidate?.startsWith(WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX));
    expect(recoveryKey).toBeTruthy();
    expect(window.localStorage.getItem(recoveryKey!)).toBe(raw);
  });

  it("quarantines mixed-owner rows instead of silently filtering them", () => {
    const owned = upsertQueuedWrite(SCOPE_A, [], "transactions.add", {}, {
      clientMutationId: "owned",
      now: 1
    }).item;
    const foreign = { ...owned, id: "foreign", clientMutationId: "foreign", ownerId: "user-b" };
    const key = `numa:write-queue:v2:${encodeURIComponent(SCOPE_A.deployment)}:${encodeURIComponent(SCOPE_A.ownerId)}`;
    const raw = JSON.stringify([owned, foreign]);
    window.localStorage.setItem(key, raw);

    expect(loadWriteQueueForScope(window.localStorage, SCOPE_A)).toEqual([owned]);
    expect(
      Array.from({ length: window.localStorage.length }, (_, index) =>
        window.localStorage.key(index)
      ).some((candidate) => candidate?.startsWith(WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX))
    ).toBe(true);
  });

  it("does not create a cloud queue scope for a placeholder identity", () => {
    expect(writeQueueScopeForAccount("deployment", { id: "cloud-loading", isCloud: true })).toBeNull();
    expect(writeQueueScopeForAccount("deployment", { id: "user-a", isCloud: true })).toEqual({
      ownerId: "user-a",
      deployment: "deployment"
    });
  });

  it("separates current-account recovery from device-level unowned data", () => {
    const scopedA = `${WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX}${encodeURIComponent(SCOPE_A.deployment)}:${encodeURIComponent(SCOPE_A.ownerId)}:a`;
    const scopedB = `${WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX}${encodeURIComponent(SCOPE_B.deployment)}:${encodeURIComponent(SCOPE_B.ownerId)}:b`;
    window.localStorage.setItem(scopedA, JSON.stringify([{ id: "only-a" }]));
    window.localStorage.setItem(scopedB, JSON.stringify([{ id: "only-b" }]));
    window.localStorage.setItem(
      WRITE_QUEUE_QUARANTINE_KEY,
      JSON.stringify([{ id: "unowned-legacy" }])
    );

    const accountRecovery = readScopedWriteQueueRecovery(SCOPE_A, window.localStorage);
    const deviceRecovery = readDeviceWriteQueueRecovery(window.localStorage);

    expect(accountRecovery.count).toBe(1);
    expect(accountRecovery.raw).toContain("only-a");
    expect(accountRecovery.raw).not.toContain("only-b");
    expect(accountRecovery.raw).not.toContain("unowned-legacy");
    expect(deviceRecovery.raw).toContain("unowned-legacy");
    expect(deviceRecovery.raw).not.toContain("only-a");
    expect(deviceRecovery.raw).not.toContain("only-b");
  });

  it("derives stable redraft and money ids from the failed queue row", () => {
    const ids = auditedRetryIds({ id: "queue-1", auditDraftId: "draft-failed" });
    expect(ids).toEqual({
      retryRequestId: "redraft:queue-1:draft-failed",
      clientMutationId: "write:redraft:queue-1:draft-failed"
    });
  });
});

describe("write queue provider retries", () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(WriteQueueProvider, null, children);

  beforeEach(() => {
    window.localStorage.clear();
    cloudMocks.accountId = "user-a";
    for (const key of Object.keys(cloudMocks.mutations)) {
      delete cloudMocks.mutations[key];
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps a transient online failure as pending and flushes it afterwards", async () => {
    const addTransaction = vi.fn().mockResolvedValue({ id: "t1" });
    cloudMocks.mutations.addTransaction = addTransaction;
    const { result } = renderHook(() => useWriteQueue(), { wrapper });

    let outcome: { queued: boolean; clientMutationId: string } | undefined;
    await act(async () => {
      outcome = await result.current.runOrQueue({
        operation: "transactions.add",
        payload: { amount: 10 },
        clientMutationId: "cm-transient",
        execute: () => Promise.reject(new Error("Failed to fetch"))
      });
    });
    expect(outcome).toMatchObject({ queued: true, clientMutationId: "cm-transient" });

    await waitFor(() => {
      expect(addTransaction).toHaveBeenCalledTimes(1);
      expect(
        result.current.items.find((item) => item.clientMutationId === "cm-transient")
      ).toMatchObject({ status: "applied" });
    });
    expect(addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10, clientMutationId: "cm-transient" })
    );
  });

  it("retries with backoff instead of hot-looping when the executor keeps failing", async () => {
    const addTransaction = vi.fn().mockRejectedValue(new Error("network unavailable"));
    cloudMocks.mutations.addTransaction = addTransaction;
    const realNow = Date.now.bind(Date);
    let offsetMs = 0;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + offsetMs);

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await act(async () => {
      await result.current.runOrQueue({
        operation: "transactions.add",
        payload: { amount: 10 },
        clientMutationId: "cm-loop",
        execute: () => Promise.reject(new Error("Failed to fetch"))
      });
    });

    const item = () => result.current.items.find((entry) => entry.clientMutationId === "cm-loop");
    await waitFor(() => {
      expect(addTransaction).toHaveBeenCalledTimes(1);
      expect(item()).toMatchObject({
        status: "pending",
        attempts: 1,
        lastError: "network unavailable"
      });
    });

    // Backoff window not elapsed: an immediate flush must not re-attempt.
    await act(async () => {
      await result.current.flushPending();
    });
    expect(addTransaction).toHaveBeenCalledTimes(1);

    // Once the backoff window has elapsed, the same write is retried.
    offsetMs = queuedWriteRetryDelayMs(1) + 1;
    await act(async () => {
      await result.current.flushPending();
    });
    expect(addTransaction).toHaveBeenCalledTimes(2);
  });

  it("parks a persistently failing write after the attempt cap and retryFailed revives it", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq_seed",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-park" },
      clientMutationId: "cm-park",
      status: "pending",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS - 1,
      lastError: "network unavailable",
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    const addTransaction = vi.fn().mockRejectedValue(new Error("network unavailable"));
    cloudMocks.mutations.addTransaction = addTransaction;

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(addTransaction).toHaveBeenCalledTimes(1);
      expect(
        result.current.items.find((entry) => entry.clientMutationId === "cm-park")
      ).toMatchObject({ status: "failed", attempts: MAX_QUEUED_WRITE_ATTEMPTS });
    });

    act(() => {
      result.current.retryFailed();
    });
    await waitFor(() => {
      expect(addTransaction).toHaveBeenCalledTimes(2);
      expect(
        result.current.items.find((entry) => entry.clientMutationId === "cm-park")
      ).toMatchObject({ status: "pending", attempts: 1 });
    });
  });

  it("marks the linked AI audit failed when a queued write reaches a terminal failure", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq_audited",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-audited" },
      clientMutationId: "cm-audited",
      auditDraftId: "draft-audited",
      status: "pending",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS - 1,
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockRejectedValue(new Error("network unavailable"));
    cloudMocks.mutations.markAiActionFailed = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.items.find((entry) => entry.id === "wq_audited")).toMatchObject({
        status: "failed",
        attempts: MAX_QUEUED_WRITE_ATTEMPTS
      });
      expect(cloudMocks.mutations.markAiActionFailed).toHaveBeenCalledWith({
        id: "draft-audited",
        error: "network unavailable"
      });
    });
  });

  it("treats a confirmed audit as applied after an ambiguous response reaches the cap", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq_ambiguous",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-ambiguous", auditDraftId: "draft-confirmed" },
      clientMutationId: "cm-ambiguous",
      auditDraftId: "draft-confirmed",
      status: "pending",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS - 1,
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockRejectedValue(new Error("network unavailable"));
    cloudMocks.mutations.markAiActionFailed = vi.fn().mockResolvedValue({
      id: "draft-confirmed",
      status: "confirmed",
      resultId: "transaction-1"
    });

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.items.find((item) => item.id === "wq_ambiguous"))
        .toMatchObject({ status: "applied", auditFailurePending: false });
    });
  });

  it("keeps an audited write failed when confirmation has no proven result id", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq_unproven",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-unproven", auditDraftId: "draft-unproven" },
      clientMutationId: "cm-unproven",
      auditDraftId: "draft-unproven",
      status: "pending",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS - 1,
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockRejectedValue(new Error("network unavailable"));
    cloudMocks.mutations.markAiActionFailed = vi.fn().mockResolvedValue({
      id: "draft-unproven",
      status: "confirmed"
    });

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current.items.find((item) => item.id === "wq_unproven"))
        .toMatchObject({
          status: "failed",
          lastError: "network unavailable",
          auditFailurePending: false
        });
    });
  });

  it("never auto-revives a terminal audited write", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq_terminal_audit",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-terminal-audit" },
      clientMutationId: "cm-terminal-audit",
      auditDraftId: "draft-terminal",
      status: "failed",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS,
      lastError: "validation failed",
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockResolvedValue({ id: "unexpected" });

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    act(() => result.current.retryFailed());
    await act(async () => result.current.flushPending());

    expect(cloudMocks.mutations.addTransaction).not.toHaveBeenCalled();
    expect(result.current.items[0]).toMatchObject({ status: "failed", auditDraftId: "draft-terminal" });
  });

  it("retries failed audit bookkeeping without replaying terminal money", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq_audit_bookkeeping",
      operation: "transactions.add",
      payload: { clientMutationId: "cm-audit-bookkeeping" },
      clientMutationId: "cm-audit-bookkeeping",
      auditDraftId: "draft-bookkeeping",
      auditFailurePending: true,
      status: "failed",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS,
      lastError: "validation failed",
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockResolvedValue({ id: "unexpected" });
    cloudMocks.mutations.markAiActionFailed = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(cloudMocks.mutations.markAiActionFailed).toHaveBeenCalledWith({
        id: "draft-bookkeeping",
        error: "validation failed"
      });
      expect(result.current.items[0]).toMatchObject({
        status: "failed",
        auditFailurePending: false
      });
    });
    expect(cloudMocks.mutations.addTransaction).not.toHaveBeenCalled();
  });

  it("continues with independent queued writes after one permanent failure", async () => {
    const first = upsertQueuedWrite(
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [],
      "transactions.add",
      {},
      { clientMutationId: "cm-first", now: 1 }
    );
    const second = upsertQueuedWrite(
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      first.items,
      "categories.add",
      {},
      { clientMutationId: "cm-second", now: 2 }
    );
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      second.items
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockRejectedValue(new Error("validation failed"));
    cloudMocks.mutations.addCategory = vi.fn().mockResolvedValue({ id: "category" });

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(cloudMocks.mutations.addTransaction).toHaveBeenCalledTimes(1);
      expect(cloudMocks.mutations.addCategory).toHaveBeenCalledTimes(1);
      expect(result.current.items.find((item) => item.clientMutationId === "cm-first"))
        .toMatchObject({ status: "failed" });
      expect(result.current.items.find((item) => item.clientMutationId === "cm-second"))
        .toMatchObject({ status: "applied" });
    });
  });

  it("marks an audited missing executor failed without attempting money", async () => {
    const seeded = upsertQueuedWrite(
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [],
      "removed.operation",
      {},
      { clientMutationId: "cm-removed", auditDraftId: "draft-removed", now: 1 }
    ).items;
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      seeded
    );
    cloudMocks.mutations.markAiActionFailed = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => {
      expect(cloudMocks.mutations.markAiActionFailed).toHaveBeenCalledWith({
        id: "draft-removed",
        error: "No executor registered for removed.operation"
      });
      expect(result.current.items[0]).toMatchObject({ status: "failed" });
    });
  });

  it("stops an account A flush before a second write after switching to account B", async () => {
    const scope = { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT };
    const first = upsertQueuedWrite(scope, [], "transactions.add", {}, {
      clientMutationId: "cm-a1",
      now: 1
    });
    const second = upsertQueuedWrite(scope, first.items, "transactions.add", {}, {
      clientMutationId: "cm-a2",
      now: 2
    });
    saveWriteQueueForScope(window.localStorage, scope, second.items);

    let resolveFirst!: (value: unknown) => void;
    const deferred = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const addTransaction = vi.fn().mockImplementation(() => deferred);
    cloudMocks.mutations.addTransaction = addTransaction;

    const { rerender } = renderHook(() => useWriteQueue(), { wrapper });
    await waitFor(() => expect(addTransaction).toHaveBeenCalledTimes(1));

    cloudMocks.accountId = "user-b";
    rerender();
    resolveFirst({ id: "transaction-a1" });
    await act(async () => Promise.resolve());

    expect(addTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not recreate an old account queue when a direct write rejects after account replacement", async () => {
    let rejectWrite!: (reason: Error) => void;
    const delayedWrite = new Promise<never>((_resolve, reject) => {
      rejectWrite = reject;
    });
    const { result, rerender } = renderHook(() => useWriteQueue(), { wrapper });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.runOrQueue({
        operation: "transactions.add",
        payload: { amount: 10 },
        clientMutationId: "cm-stale-direct",
        execute: () => delayedWrite
      });
    });

    const oldKey = writeQueueStorageKey({
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    });
    cloudMocks.accountId = "user-b";
    act(() => rerender());
    window.localStorage.removeItem(oldKey);

    rejectWrite(new Error("Failed to fetch"));
    await expect(pending).rejects.toThrow("account changed");
    expect(window.localStorage.getItem(oldKey)).toBeNull();
  });

  it("single-flights rapid reviewed retries and executes money once", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq-reviewed",
      operation: "transactions.add",
      payload: { clientMutationId: "old", auditDraftId: "draft-failed", amount: 10 },
      clientMutationId: "old",
      auditDraftId: "draft-failed",
      status: "failed",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS,
      lastError: "validation failed",
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    let resolveRedraft!: (value: string) => void;
    cloudMocks.mutations.redraftFailedAiAction = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveRedraft = resolve; })
    );
    cloudMocks.mutations.addTransaction = vi.fn().mockResolvedValue({ id: "transaction-1" });

    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    let first!: Promise<number>;
    let second!: Promise<number>;
    act(() => {
      first = result.current.retryAuditedFailed();
      second = result.current.retryAuditedFailed();
    });

    expect(second).toBe(first);
    expect(cloudMocks.mutations.redraftFailedAiAction).toHaveBeenCalledTimes(1);
    resolveRedraft("draft-retry");
    await act(async () => {
      await Promise.all([first, second]);
    });

    await waitFor(() => {
      expect(cloudMocks.mutations.addTransaction).toHaveBeenCalledTimes(1);
      expect(result.current.items[0]).toMatchObject({
        status: "applied",
        auditDraftId: "draft-retry",
        clientMutationId: "write:redraft:wq-reviewed:draft-failed"
      });
    });
    expect(cloudMocks.mutations.redraftFailedAiAction).toHaveBeenCalledWith({
      id: "draft-failed",
      retryRequestId: "redraft:wq-reviewed:draft-failed"
    });
  });

  it("reuses stable ids after a crash between server redraft and local persistence", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq-crash",
      operation: "transactions.add",
      payload: { clientMutationId: "old", auditDraftId: "draft-failed", amount: 10 },
      clientMutationId: "old",
      auditDraftId: "draft-failed",
      status: "failed",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS,
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.redraftFailedAiAction = vi.fn().mockResolvedValue("draft-retry");
    cloudMocks.mutations.addTransaction = vi.fn().mockResolvedValue({ id: "transaction-1" });
    const { result } = renderHook(() => useWriteQueue(), { wrapper });
    const originalSetItem = Storage.prototype.setItem;
    let failPersist = true;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (failPersist && String(value).includes("draft-retry")) {
        failPersist = false;
        throw new Error("simulated storage crash");
      }
      return originalSetItem.call(this, key, value);
    });

    await expect(result.current.retryAuditedFailed()).rejects.toThrow(/storage crash/i);
    setItem.mockRestore();
    await act(async () => {
      await result.current.retryAuditedFailed();
    });

    expect(cloudMocks.mutations.redraftFailedAiAction).toHaveBeenCalledTimes(2);
    expect(cloudMocks.mutations.redraftFailedAiAction).toHaveBeenNthCalledWith(1, {
      id: "draft-failed",
      retryRequestId: "redraft:wq-crash:draft-failed"
    });
    expect(cloudMocks.mutations.redraftFailedAiAction).toHaveBeenNthCalledWith(2, {
      id: "draft-failed",
      retryRequestId: "redraft:wq-crash:draft-failed"
    });
    await waitFor(() => expect(cloudMocks.mutations.addTransaction).toHaveBeenCalledTimes(1));
  });

  it("allows an online retry after an offline precondition rejection", async () => {
    const seeded: QueuedWriteOperation = {
      id: "wq-offline",
      operation: "transactions.add",
      payload: { clientMutationId: "old", auditDraftId: "draft-failed" },
      clientMutationId: "old",
      auditDraftId: "draft-failed",
      status: "failed",
      attempts: MAX_QUEUED_WRITE_ATTEMPTS,
      createdAt: 1,
      updatedAt: 1,
      ownerId: "user-a",
      deployment: WRITE_QUEUE_DEPLOYMENT
    };
    saveWriteQueueForScope(
      window.localStorage,
      { ownerId: "user-a", deployment: WRITE_QUEUE_DEPLOYMENT },
      [seeded]
    );
    cloudMocks.mutations.redraftFailedAiAction = vi.fn().mockResolvedValue("draft-retry");
    cloudMocks.mutations.addTransaction = vi.fn().mockResolvedValue({ id: "transaction-1" });
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useWriteQueue(), { wrapper });

    await expect(result.current.retryAuditedFailed()).rejects.toThrow(/connect/i);
    online.mockReturnValue(true);
    await act(async () => {
      await result.current.retryAuditedFailed();
    });

    await waitFor(() => expect(cloudMocks.mutations.addTransaction).toHaveBeenCalledTimes(1));
  });
});
