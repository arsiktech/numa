import { newId } from "@/lib/ids";

export type QueuedWriteStatus = "pending" | "syncing" | "failed" | "applied";

export interface QueuedWriteOperation {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  clientMutationId: string;
  status: QueuedWriteStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  deployment: string;
  auditDraftId?: string;
  auditFailurePending?: boolean;
}

export interface QueuedWriteScope {
  ownerId: string;
  deployment: string;
}

export interface RunOrQueueOptions<T> {
  operation: string;
  payload: Record<string, unknown>;
  execute: (payload: Record<string, unknown>) => Promise<T>;
  clientMutationId?: string;
  auditDraftId?: string;
}

export interface RunOrQueueResult<T> {
  result?: T;
  queued: boolean;
  clientMutationId: string;
}

export interface WriteQueueContextValue {
  items: QueuedWriteOperation[];
  enqueue: (
    operation: string,
    payload: Record<string, unknown>,
    options?: {
      clientMutationId?: string;
      auditDraftId?: string;
      status?: QueuedWriteStatus;
      error?: string;
    }
  ) => QueuedWriteOperation;
  runOrQueue: <T>(options: RunOrQueueOptions<T>) => Promise<RunOrQueueResult<T>>;
  flushPending: () => Promise<void>;
  retryFailed: () => void;
  retryAuditedFailed: () => Promise<number>;
}

/**
 * Write-queue storage + queue-data helpers: persistence keys, scope handling,
 * legacy quarantine, retry timing and item transitions. The React provider
 * (writeQueue.tsx) owns the runtime; this module owns what goes on disk and
 * how a queued write is represented, so both are testable in isolation.
 */

export const WRITE_QUEUE_LEGACY_KEY = "numa:write-queue:v1";
export const WRITE_QUEUE_QUARANTINE_KEY = "numa:write-queue:quarantine:v1";
export const WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX = "numa:write-queue:quarantine:v2:";
export const WRITE_QUEUE_STORAGE_PREFIX = "numa:write-queue:v2:";
export const WRITE_QUEUE_DEPLOYMENT =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() || "unknown-convex";
const MAX_APPLIED_TO_KEEP = 30;
export const MAX_QUEUED_WRITE_ATTEMPTS = 8;
export const RETRY_BACKOFF_BASE_MS = 2_000;
const RETRY_BACKOFF_MAX_MS = 5 * 60 * 1000;


export function readScopedWriteQueueRecovery(
  scope: QueuedWriteScope | null,
  storage = browserStorage()
) {
  if (!storage || !scope) return { count: 0, raw: null as string | null };
  try {
    const scopedPrefix = `${WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX}${encodeURIComponent(scope.deployment)}:${encodeURIComponent(scope.ownerId)}:`;
    const scoped = storageKeys(storage)
      .filter((key) => key.startsWith(scopedPrefix))
      .map((key) => ({ key, raw: storage.getItem(key) }))
      .filter((entry): entry is { key: string; raw: string } => entry.raw !== null);
    const raws = scoped.map((entry) => entry.raw);
    if (raws.length === 0) return { count: 0, raw: null as string | null };
    const count = raws.reduce((total, raw) => {
      const parsed = JSON.parse(raw) as unknown;
      return total + (Array.isArray(parsed) ? parsed.length : 1);
    }, 0);
    return {
      count,
      raw: raws.length === 1
        ? raws[0]!
        : JSON.stringify({ scoped })
    };
  } catch {
    const scopedPrefix = `${WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX}${encodeURIComponent(scope.deployment)}:${encodeURIComponent(scope.ownerId)}:`;
    const scoped = storageKeys(storage)
      .filter((key) => key.startsWith(scopedPrefix))
      .map((key) => ({ key, raw: storage.getItem(key) }));
    return {
      count: scoped.length,
      raw: scoped.length > 0 ? JSON.stringify({ scoped }) : null
    };
  }
}

export function readDeviceWriteQueueRecovery(storage = browserStorage()) {
  if (!storage) return { count: 0, raw: null as string | null };
  const entries = [WRITE_QUEUE_LEGACY_KEY, WRITE_QUEUE_QUARANTINE_KEY]
    .map((key) => ({ key, raw: storage.getItem(key) }))
    .filter((entry): entry is { key: string; raw: string } => entry.raw !== null);
  if (entries.length === 0) return { count: 0, raw: null as string | null };
  const count = entries.reduce((total, entry) => {
    try {
      const parsed = JSON.parse(entry.raw) as unknown;
      return total + (Array.isArray(parsed) ? parsed.length : 1);
    } catch {
      return total + 1;
    }
  }, 0);
  return { count, raw: JSON.stringify({ deviceLevelUnowned: entries }) };
}

export function storageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function makeClientMutationId(operation: string) {
  return `${operation}:${newId("mut")}`;
}

export function auditedRetryIds(item: Pick<QueuedWriteOperation, "id" | "auditDraftId">) {
  if (!item.auditDraftId) {
    throw new Error("A reviewed retry requires its failed audit draft.");
  }
  const retryRequestId = `redraft:${item.id}:${item.auditDraftId}`;
  return {
    retryRequestId,
    clientMutationId: `write:${retryRequestId}`
  };
}

export function isTransientWriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|offline|timeout|aborted|temporar|unavailable|failed to fetch|websocket/i.test(
    message
  );
}

export function accountChangedWriteError(cause: unknown) {
  return Object.assign(
    new Error("Your account changed while this write was in progress."),
    { cause }
  );
}

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function writeQueueScopeForAccount(
  deployment: string,
  account: { id: string; isCloud?: boolean } | null | undefined
): QueuedWriteScope | null {
  if (!account?.isCloud || !account.id || account.id === "cloud-loading") return null;
  return { ownerId: account.id, deployment };
}

export function writeQueueStorageKey(scope: QueuedWriteScope) {
  return `${WRITE_QUEUE_STORAGE_PREFIX}${encodeURIComponent(scope.deployment)}:${encodeURIComponent(scope.ownerId)}`;
}

export function quarantineLegacyQueue(storage: Storage) {
  try {
    const raw = storage.getItem(WRITE_QUEUE_LEGACY_KEY);
    if (!raw) return [];
    const existingRaw = storage.getItem(WRITE_QUEUE_QUARANTINE_KEY);
    let nextRaw = raw;
    if (existingRaw && existingRaw !== raw) {
      const existing = JSON.parse(existingRaw) as unknown;
      const incoming = JSON.parse(raw) as unknown;
      if (!Array.isArray(existing) || !Array.isArray(incoming)) return [];
      const seen = new Set<string>();
      nextRaw = JSON.stringify(
        [...existing, ...incoming].filter((item) => {
          const key = JSON.stringify(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    }
    storage.setItem(WRITE_QUEUE_QUARANTINE_KEY, nextRaw);
    if (storage.getItem(WRITE_QUEUE_QUARANTINE_KEY) === nextRaw) {
      storage.removeItem(WRITE_QUEUE_LEGACY_KEY);
    }
  } catch {
    /* local persistence is best-effort; unowned writes are never adopted */
  }
}

export function loadWriteQueueForScope(
  storage: Storage,
  scope: QueuedWriteScope
): QueuedWriteOperation[] {
  quarantineLegacyQueue(storage);
  try {
    const raw = storage.getItem(writeQueueStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      quarantineScopedQueue(storage, scope, raw);
      return [];
    }
    const valid = parsed.filter((item): item is QueuedWriteOperation =>
      isValidQueuedWriteForScope(item, scope)
    );
    if (valid.length !== parsed.length) {
      quarantineScopedQueue(storage, scope, raw);
    }
    return valid
      .map((item) =>
        item.status === "syncing"
          ? {
              ...item,
              status: "pending" as const,
              lastError: item.lastError ?? "Interrupted before sync completed"
            }
          : item
      )
      .sort(compareQueueItems);
  } catch {
    const raw = storage.getItem(writeQueueStorageKey(scope));
    if (raw) quarantineScopedQueue(storage, scope, raw);
    return [];
  }
}

export function isValidQueuedWriteForScope(
  value: unknown,
  scope: QueuedWriteScope
): value is QueuedWriteOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<QueuedWriteOperation>;
  return Boolean(
    typeof item.id === "string" &&
    typeof item.operation === "string" &&
    item.payload &&
    typeof item.payload === "object" &&
    !Array.isArray(item.payload) &&
    typeof item.clientMutationId === "string" &&
    ["pending", "syncing", "failed", "applied"].includes(String(item.status)) &&
    typeof item.attempts === "number" &&
    Number.isFinite(item.attempts) &&
    item.attempts >= 0 &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number" &&
    item.ownerId === scope.ownerId &&
    item.deployment === scope.deployment
  );
}

export function quarantineScopedQueue(
  storage: Storage,
  scope: QueuedWriteScope,
  raw: string
) {
  const key = `${WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX}${encodeURIComponent(scope.deployment)}:${encodeURIComponent(scope.ownerId)}:${newId("recovery")}`;
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) {
    throw new Error("Numa Pro could not preserve a damaged offline write queue.");
  }
}

export function saveWriteQueueForScope(
  storage: Storage,
  scope: QueuedWriteScope,
  items: QueuedWriteOperation[]
) {
  try {
    persistWriteQueueForScope(storage, scope, items);
  } catch {
    /* ignore quota */
  }
}

export function persistWriteQueueForScope(
  storage: Storage,
  scope: QueuedWriteScope,
  items: QueuedWriteOperation[]
) {
  const owned = items.filter(
    (item) => item.ownerId === scope.ownerId && item.deployment === scope.deployment
  );
  const key = writeQueueStorageKey(scope);
  const raw = JSON.stringify(pruneQueue(owned));
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) {
    throw new Error("Numa Pro could not durably save the offline write queue.");
  }
}

export function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function compareQueueItems(a: QueuedWriteOperation, b: QueuedWriteOperation) {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

export function pruneQueue(items: QueuedWriteOperation[]) {
  const active = items.filter((item) => item.status !== "applied");
  const applied = items
    .filter((item) => item.status === "applied")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_APPLIED_TO_KEEP);
  return [...active, ...applied].sort(compareQueueItems);
}

export function queuedWriteRetryDelayMs(attempts: number) {
  if (attempts <= 0) return 0;
  return Math.min(RETRY_BACKOFF_BASE_MS * 2 ** (attempts - 1), RETRY_BACKOFF_MAX_MS);
}

export function isQueuedWriteDue(item: QueuedWriteOperation, now = Date.now()) {
  if (item.status !== "pending") return false;
  return now - item.updatedAt >= queuedWriteRetryDelayMs(item.attempts);
}

export function pendingQueueSignature(items: QueuedWriteOperation[]) {
  return items
    .filter((item) => item.status === "pending")
    .sort(compareQueueItems)
    .map((item) => `${item.id}:${item.clientMutationId}:${item.updatedAt}`)
    .join("|");
}

export function nextQueuedWriteDelayMs(
  items: QueuedWriteOperation[],
  now = Date.now()
) {
  const dueAt = items
    .filter((item) => item.status === "pending")
    .map((item) => item.updatedAt + queuedWriteRetryDelayMs(item.attempts));
  if (dueAt.length === 0) return null;
  return Math.max(0, Math.min(...dueAt) - now);
}

export function upsertQueuedWrite(
  scope: QueuedWriteScope,
  items: QueuedWriteOperation[],
  operation: string,
  payload: Record<string, unknown>,
  options?: {
    clientMutationId?: string;
    auditDraftId?: string;
    status?: QueuedWriteStatus;
    error?: string;
    now?: number;
  }
) {
  const now = options?.now ?? Date.now();
  const clientMutationId =
    options?.clientMutationId ??
    (typeof payload.clientMutationId === "string"
      ? payload.clientMutationId
      : makeClientMutationId(operation));
  const nextPayload = { ...payload, clientMutationId };
  const existing = items.find(
    (item) =>
      item.clientMutationId === clientMutationId &&
      item.ownerId === scope.ownerId &&
      item.deployment === scope.deployment
  );
  if (existing) {
    const item = {
      ...existing,
      payload: nextPayload,
      status: options?.status ?? existing.status,
      lastError: options?.error ?? existing.lastError,
      auditDraftId: options?.auditDraftId ?? existing.auditDraftId,
      updatedAt: now
    };
    return {
      item,
      items: items.map((current) => (current.id === existing.id ? item : current))
    };
  }
  const item: QueuedWriteOperation = {
    id: newId("wq"),
    operation,
    payload: nextPayload,
    clientMutationId,
    status: options?.status ?? "pending",
    attempts: 0,
    lastError: options?.error,
    createdAt: now,
    updatedAt: now,
    ownerId: scope.ownerId,
    deployment: scope.deployment,
    auditDraftId: options?.auditDraftId
  };
  return { item, items: [...items, item].sort(compareQueueItems) };
}

export function markQueuedWriteStatus(
  items: QueuedWriteOperation[],
  id: string,
  status: QueuedWriteStatus,
  options?: { error?: string; now?: number; incrementAttempts?: boolean }
) {
  const now = options?.now ?? Date.now();
  return pruneQueue(
    items.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            attempts: item.attempts + (options?.incrementAttempts ? 1 : 0),
            lastError: options?.error,
            updatedAt: now
          }
        : item
    )
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function auditResultIsConfirmed(result: unknown) {
  return Boolean(
    result &&
    typeof result === "object" &&
    "status" in result &&
    result.status === "confirmed" &&
    "resultId" in result &&
    typeof result.resultId === "string" &&
    result.resultId.trim().length > 0
  );
}
