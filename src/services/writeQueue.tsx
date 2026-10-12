import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useAuth } from "./auth";
import { useCloudMutations, useCloudState } from "./cloudStore";
import {
  accountChangedWriteError,
  auditedRetryIds,
  auditResultIsConfirmed,
  browserStorage,
  compareQueueItems,
  errorMessage,
  MAX_QUEUED_WRITE_ATTEMPTS,
  WRITE_QUEUE_DEPLOYMENT,
  writeQueueStorageKey,
  type WriteQueueContextValue,
  isOnline,
  isQueuedWriteDue,
  isTransientWriteError,
  loadWriteQueueForScope,
  makeClientMutationId,
  nextQueuedWriteDelayMs,
  pendingQueueSignature,
  persistWriteQueueForScope,
  pruneQueue,
  RETRY_BACKOFF_BASE_MS,
  saveWriteQueueForScope,
  upsertQueuedWrite,
  writeQueueScopeForAccount,
  type QueuedWriteOperation,
  type QueuedWriteScope,
} from "./writeQueueStorage";

const WriteQueueCtx = createContext<WriteQueueContextValue | null>(null);

export type { QueuedWriteOperation, QueuedWriteScope, QueuedWriteStatus } from "./writeQueueStorage";
export {
  WRITE_QUEUE_LEGACY_KEY,
  WRITE_QUEUE_QUARANTINE_KEY,
  WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX,
  WRITE_QUEUE_STORAGE_PREFIX,
  WRITE_QUEUE_DEPLOYMENT,
  MAX_QUEUED_WRITE_ATTEMPTS,
  readScopedWriteQueueRecovery,
  readDeviceWriteQueueRecovery,
  makeClientMutationId,
  auditedRetryIds,
  isTransientWriteError,
  writeQueueScopeForAccount,
  writeQueueStorageKey,
  loadWriteQueueForScope,
  saveWriteQueueForScope,
  persistWriteQueueForScope,
  queuedWriteRetryDelayMs,
  isQueuedWriteDue,
  pendingQueueSignature,
  nextQueuedWriteDelayMs,
  upsertQueuedWrite,
  markQueuedWriteStatus
} from "./writeQueueStorage";

export function buildExecutors(mutations: ReturnType<typeof useCloudMutations>) {
  const map: Record<string, (payload: Record<string, unknown>) => Promise<unknown>> = {
    "portfolios.create": (payload) => mutations.createPortfolio(payload as any),
    "portfolios.update": (payload) => mutations.updatePortfolio(payload as any),
    "portfolios.remove": (payload) => mutations.removePortfolio(payload as any),
    "transactions.add": (payload) => mutations.addTransaction(payload as any),
    "transactions.update": (payload) => mutations.updateTransaction(payload as any),
    "transactions.remove": (payload) => mutations.removeTransaction(payload as any),
    "categories.add": (payload) => mutations.addCategory(payload as any),
    "categories.update": (payload) => mutations.updateCategory(payload as any),
    "categories.remove": (payload) => mutations.removeCategory(payload as any),
    "assets.add": (payload) => mutations.addAsset(payload as any),
    "assets.update": (payload) => mutations.updateAsset(payload as any),
    "assets.adjustBalance": (payload) => mutations.adjustAssetBalance(payload as any),
    "assets.remove": (payload) => mutations.removeAsset(payload as any),
    "liabilities.add": (payload) => mutations.addLiability(payload as any),
    "liabilities.update": (payload) => mutations.updateLiability(payload as any),
    "liabilities.remove": (payload) => mutations.removeLiability(payload as any),
    "holdings.add": (payload) => mutations.addHolding(payload as any),
    "holdings.update": (payload) => mutations.updateHolding(payload as any),
    "holdings.remove": (payload) => mutations.removeHolding(payload as any),
    "holdingEvents.add": (payload) => mutations.addHoldingEvent(payload as any),
    "cryptoWallets.update": (payload) => mutations.updateCryptoWallet(payload as any),
    "cryptoWallets.remove": (payload) => mutations.removeCryptoWallet(payload as any),
    "settlements.add": (payload) => mutations.addSettlement(payload as any),
    "settlements.remove": (payload) => mutations.removeSettlement(payload as any),
    "recurring.add": (payload) => mutations.addRecurring(payload as any),
    "recurring.update": (payload) => mutations.updateRecurring(payload as any),
    "recurring.remove": (payload) => mutations.removeRecurring(payload as any),
    "goals.upsert": (payload) => mutations.upsertGoal(payload as any),
    "goals.remove": (payload) => mutations.removeGoal(payload as any),
    "wealthSnapshots.add": (payload) => mutations.addSnapshot(payload as any),
    "wealthSnapshots.update": (payload) => mutations.updateSnapshot(payload as any),
    "wealthSnapshots.remove": (payload) => mutations.removeSnapshot(payload as any),
    "moneyPods.create": (payload) => mutations.createMoneyPod(payload as any),
    "moneyPods.update": (payload) => mutations.updateMoneyPod(payload as any),
    "moneyPods.remove": (payload) => mutations.removeMoneyPod(payload as any),
    "moneyPods.leaveMoneyPod": (payload) => mutations.leaveMoneyPod(payload as any),
    "moneyPods.addMember": (payload) => mutations.addPodMember(payload as any),
    "moneyPods.updateMember": (payload) => mutations.updatePodMember(payload as any),
    "moneyPods.removeMember": (payload) => mutations.removePodMember(payload as any),
    "moneyPods.addGroup": (payload) => mutations.addPodGroup(payload as any),
    "moneyPods.updateGroup": (payload) => mutations.updatePodGroup(payload as any),
    "moneyPods.removeGroup": (payload) => mutations.removePodGroup(payload as any),
    "moneyPods.addExpense": (payload) => mutations.addPodExpense(payload as any),
    "moneyPods.updateExpense": (payload) => mutations.updatePodExpense(payload as any),
    "moneyPods.removeExpense": (payload) => mutations.removePodExpense(payload as any),
    "moneyPods.addSettlement": (payload) => mutations.addPodSettlement(payload as any),
    "moneyPods.updateSettlement": (payload) => mutations.updatePodSettlement(payload as any),
    "moneyPods.removeSettlement": (payload) => mutations.removePodSettlement(payload as any),
    "ledger.upsertAccount": (payload) => mutations.upsertLedgerAccount(payload as any),
    "ledger.recordTransaction": (payload) => mutations.recordLedgerTransaction(payload as any),
    "ledger.removeTransaction": (payload) => mutations.removeLedgerTransaction(payload as any)
  };
  return map;
}

export function WriteQueueProvider({ children }: { children: ReactNode }) {
  const { currentAccount } = useAuth();
  const scope = writeQueueScopeForAccount(WRITE_QUEUE_DEPLOYMENT, currentAccount);
  const providerKey = scope ? writeQueueStorageKey(scope) : "write-queue:unscoped";
  return (
    <ScopedWriteQueueProvider key={providerKey} scope={scope}>
      {children}
    </ScopedWriteQueueProvider>
  );
}

function ScopedWriteQueueProvider({
  children,
  scope
}: {
  children: ReactNode;
  scope: QueuedWriteScope | null;
}) {
  const cloud = useCloudState();
  const mutations = useCloudMutations();
  const executors = useMemo(() => buildExecutors(mutations), [mutations]);
  const [items, setItems] = useState<QueuedWriteOperation[]>(() => {
    const storage = browserStorage();
    return storage && scope ? loadWriteQueueForScope(storage, scope) : [];
  });
  const itemsRef = useRef(items);
  const instanceActiveRef = useRef(true);
  const flushInFlightRef = useRef(false);
  const flushRequestedRef = useRef(false);
  const auditedRetryInFlightRef = useRef<Promise<number> | null>(null);
  const commitItems = useCallback((update: (previous: QueuedWriteOperation[]) => QueuedWriteOperation[]) => {
    const next = update(itemsRef.current);
    const storage = browserStorage();
    if (storage && scope) saveWriteQueueForScope(storage, scope, next);
    itemsRef.current = next;
    setItems(next);
  }, [scope]);

  useEffect(() => {
    instanceActiveRef.current = true;
    return () => {
      instanceActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const storage = browserStorage();
    if (storage && scope) saveWriteQueueForScope(storage, scope, items);
  }, [items, scope]);

  const enqueue = useCallback<WriteQueueContextValue["enqueue"]>(
    (operation, payload, options) => {
      if (!scope) {
        throw new Error("Your cloud account is still syncing. Try again in a moment.");
      }
      const now = Date.now();
      const clientMutationId =
        options?.clientMutationId ??
        (typeof payload.clientMutationId === "string"
          ? payload.clientMutationId
          : makeClientMutationId(operation));
      const nextPayload = { ...payload, clientMutationId };
      const next = upsertQueuedWrite(scope, itemsRef.current, operation, nextPayload, {
        clientMutationId,
        auditDraftId: options?.auditDraftId,
        status: options?.status,
        error: options?.error,
        now
      });
      const storage = browserStorage();
      if (!storage) {
        throw new Error("Numa Pro cannot safely persist offline changes in this browser.");
      }
      persistWriteQueueForScope(storage, scope, next.items);
      commitItems(() => next.items);
      return next.item;
    },
    [commitItems, scope]
  );

  const flushPending = useCallback(async () => {
    if (!scope || !cloud.enabled || !isOnline()) return;
    if (flushInFlightRef.current) {
      flushRequestedRef.current = true;
      return;
    }
    flushInFlightRef.current = true;
    try {
      do {
        flushRequestedRef.current = false;

        // Retrying audit bookkeeping is deliberately separate from retrying
        // money. A terminal audited write must never be revived automatically.
        const auditFailures = itemsRef.current.filter(
          (item) =>
            item.ownerId === scope.ownerId &&
            item.deployment === scope.deployment &&
            item.status === "failed" &&
            item.auditDraftId &&
            item.auditFailurePending
        );
        for (const item of auditFailures) {
          if (!instanceActiveRef.current) break;
          try {
            const auditResult = await mutations.markAiActionFailed({
              id: item.auditDraftId as any,
              error: item.lastError ?? "Queued AI action failed"
            });
            if (!instanceActiveRef.current) break;
            commitItems((prev) =>
              pruneQueue(
                prev.map((current) =>
                  current.id === item.id
                    ? {
                        ...current,
                        status: auditResultIsConfirmed(auditResult)
                          ? "applied"
                          : current.status,
                        lastError: auditResultIsConfirmed(auditResult)
                          ? undefined
                          : current.lastError,
                        auditFailurePending: false,
                        updatedAt: Date.now()
                      }
                    : current
                )
              )
            );
          } catch {
            // Keep auditFailurePending for the next online/focus retry.
          }
        }

        const now = Date.now();
        const snapshot = itemsRef.current
          .filter(
            (item) =>
              item.ownerId === scope.ownerId &&
              item.deployment === scope.deployment &&
              isQueuedWriteDue(item, now)
          )
          .sort(compareQueueItems);
        for (const item of snapshot) {
          if (!instanceActiveRef.current) break;
          const executor = executors[item.operation];
          const failTerminal = async (message: string) => {
            let auditFailurePending = false;
            let auditAlreadyConfirmed = false;
            if (item.auditDraftId) {
              if (!instanceActiveRef.current) return;
              try {
                const auditResult = await mutations.markAiActionFailed({
                  id: item.auditDraftId as any,
                  error: message
                });
                if (!instanceActiveRef.current) return;
                auditAlreadyConfirmed = auditResultIsConfirmed(auditResult);
              } catch {
                auditFailurePending = true;
              }
            }
            if (!instanceActiveRef.current) return;
            commitItems((prev) =>
              pruneQueue(
                prev.map((current) =>
                  current.id === item.id
                    ? {
                        ...current,
                        status: auditAlreadyConfirmed ? "applied" : "failed",
                        lastError: auditAlreadyConfirmed ? undefined : message,
                        auditFailurePending: auditAlreadyConfirmed
                          ? false
                          : auditFailurePending,
                        updatedAt: Date.now()
                      }
                    : current
                )
              )
            );
          };
          if (!executor) {
            await failTerminal(`No executor registered for ${item.operation}`);
            continue;
          }
          commitItems((prev) =>
            prev.map((current) =>
              current.id === item.id
                ? {
                    ...current,
                    status: "syncing",
                    attempts: current.attempts + 1,
                    lastError: undefined,
                    updatedAt: Date.now()
                  }
                : current
            )
          );
          try {
            await executor(item.payload);
            if (!instanceActiveRef.current) break;
            commitItems((prev) =>
              pruneQueue(
                prev.map((current) =>
                  current.id === item.id
                    ? {
                        ...current,
                        status: "applied",
                        lastError: undefined,
                        auditFailurePending: false,
                        updatedAt: Date.now()
                      }
                    : current
                )
              )
            );
          } catch (error) {
            if (!instanceActiveRef.current) break;
            const transient = isTransientWriteError(error);
            const message = errorMessage(error);
            const parked =
              !transient ||
              item.attempts + 1 >= MAX_QUEUED_WRITE_ATTEMPTS;
            if (parked) {
              await failTerminal(message);
              continue;
            }
            commitItems((prev) =>
              prev.map((current) =>
                current.id === item.id
                  ? {
                      ...current,
                      status: "pending",
                      lastError: message,
                      auditFailurePending: false,
                      updatedAt: Date.now()
                    }
                  : current
              )
            );
          }
        }
      } while (
        flushRequestedRef.current &&
        itemsRef.current.some((item) => isQueuedWriteDue(item, Date.now()))
      );
    } finally {
      flushInFlightRef.current = false;
    }
  }, [cloud.enabled, commitItems, executors, mutations, scope]);

  const runOrQueue = useCallback<WriteQueueContextValue["runOrQueue"]>(
    async ({ operation, payload, execute, clientMutationId, auditDraftId }) => {
      const id =
        clientMutationId ??
        (typeof payload.clientMutationId === "string"
          ? payload.clientMutationId
          : makeClientMutationId(operation));
      const nextPayload = { ...payload, clientMutationId: id };
      if (!scope) {
        throw new Error("Your cloud account is still syncing. Try again in a moment.");
      }
      if (!cloud.enabled || !isOnline()) {
        enqueue(operation, nextPayload, {
          clientMutationId: id,
          auditDraftId,
          status: "pending"
        });
        return { queued: true, clientMutationId: id };
      }
      try {
        const result = await execute(nextPayload);
        if (!instanceActiveRef.current) {
          throw new Error("Your account changed while this write was in progress.");
        }
        return { result, queued: false, clientMutationId: id };
      } catch (error) {
        if (!instanceActiveRef.current) {
          throw accountChangedWriteError(error);
        }
        if (!isTransientWriteError(error)) throw error;
        enqueue(operation, nextPayload, {
          clientMutationId: id,
          auditDraftId,
          status: "pending",
          error: errorMessage(error)
        });
        return { queued: true, clientMutationId: id };
      }
    },
    [cloud.enabled, enqueue, scope]
  );

  const retryFailed = useCallback(() => {
    commitItems((prev) =>
      prev.map((item) =>
        item.status === "failed" && !item.auditDraftId
          ? { ...item, status: "pending", attempts: 0, updatedAt: Date.now() }
          : item
      )
    );
  }, [commitItems]);

  const retryAuditedFailed = useCallback(() => {
    if (auditedRetryInFlightRef.current) return auditedRetryInFlightRef.current;
    if (!scope || !cloud.enabled || !isOnline()) {
      return Promise.reject(
        new Error("Connect to the internet before retrying reviewed changes.")
      );
    }
    const task = (async () => {
      try {
        const failed = itemsRef.current.filter(
          (item) => item.status === "failed" && Boolean(item.auditDraftId)
        );
        let prepared = 0;
        for (const item of failed) {
          if (!instanceActiveRef.current || !item.auditDraftId) break;
          const { retryRequestId, clientMutationId: nextClientMutationId } =
            auditedRetryIds(item);
          const nextDraftId = String(await mutations.redraftFailedAiAction({
            id: item.auditDraftId as any,
            retryRequestId
          }));
          if (!instanceActiveRef.current) break;
          const nextItems = itemsRef.current.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  payload: {
                    ...current.payload,
                    clientMutationId: nextClientMutationId,
                    auditDraftId: nextDraftId
                  },
                  clientMutationId: nextClientMutationId,
                  auditDraftId: nextDraftId,
                  auditFailurePending: false,
                  status: "pending" as const,
                  attempts: 0,
                  lastError: undefined,
                  updatedAt: Date.now()
                }
              : current
          );
          const storage = browserStorage();
          if (!storage) {
            throw new Error("Numa Pro cannot safely persist offline changes in this browser.");
          }
          // Persist the linked draft and deterministic money mutation id before
          // any financial executor can observe the pending item.
          persistWriteQueueForScope(storage, scope, nextItems);
          commitItems(() => nextItems);
          prepared += 1;
        }
        await flushPending();
        return prepared;
      } finally {
        auditedRetryInFlightRef.current = null;
      }
    })();
    // Acquired synchronously before the first network await, so rapid clicks
    // and React callers share exactly one recovery operation.
    auditedRetryInFlightRef.current = task;
    return task;
  }, [cloud.enabled, commitItems, flushPending, mutations, scope]);

  const pendingSignature = pendingQueueSignature(items);
  const nextRetryDelay = nextQueuedWriteDelayMs(items);
  const hasPendingAuditFailure = items.some(
    (item) => item.status === "failed" && item.auditDraftId && item.auditFailurePending
  );

  useEffect(() => {
    if (!cloud.enabled) return;
    if (!pendingSignature) return;
    void flushPending();
  }, [cloud.enabled, flushPending, pendingSignature]);

  useEffect(() => {
    if (!cloud.enabled || nextRetryDelay === null) return;
    const timer = window.setTimeout(() => void flushPending(), Math.max(1, nextRetryDelay));
    return () => window.clearTimeout(timer);
  }, [cloud.enabled, flushPending, nextRetryDelay]);

  useEffect(() => {
    if (!cloud.enabled || !hasPendingAuditFailure) return;
    let cancelled = false;
    let timer: number | undefined;
    const retryAuditOnly = async () => {
      await flushPending();
      if (
        !cancelled &&
        itemsRef.current.some(
          (item) => item.status === "failed" && item.auditDraftId && item.auditFailurePending
        )
      ) {
        timer = window.setTimeout(() => void retryAuditOnly(), RETRY_BACKOFF_BASE_MS);
      }
    };
    void retryAuditOnly();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cloud.enabled, flushPending, hasPendingAuditFailure]);

  useEffect(() => {
    function onOnline() {
      retryFailed();
      void flushPending();
    }
    function onFocus() {
      retryFailed();
      void flushPending();
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [flushPending, retryFailed]);

  const value = useMemo<WriteQueueContextValue>(
    () => ({
      items,
      enqueue,
      runOrQueue,
      flushPending,
      retryFailed,
      retryAuditedFailed
    }),
    [items, enqueue, runOrQueue, flushPending, retryFailed, retryAuditedFailed]
  );

  return <WriteQueueCtx.Provider value={value}>{children}</WriteQueueCtx.Provider>;
}

export function useWriteQueue() {
  const ctx = useContext(WriteQueueCtx);
  if (!ctx) throw new Error("useWriteQueue must be used inside <WriteQueueProvider>");
  return ctx;
}
