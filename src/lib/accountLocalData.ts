import { cloudSnapshotCacheKey } from "./cloudSnapshotCache";
import {
  clearLegacyPortfolioCaches,
  isAccountCacheKeyForOwner
} from "./accountCache";

const CURRENT_SESSION_KEYS = [
  "numa:active-money-pod-id",
  "numa:profile:pending",
  "numa:onboarding:primaryJob",
  "numa:onboarding:starterTemplate",
  "numa:onboarding:weeklyTarget",
  "numa:onboarding:potName"
];
const WRITE_QUEUE_STORAGE_PREFIX = "numa:write-queue:v2:";
const WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX = "numa:write-queue:quarantine:v2:";

export function clearAccountLocalData({
  accountId,
  accountEmail,
  portfolioIds = [],
  cloudSnapshotScopes = [],
  preserveWriteQueue = false,
  clearCurrentSession = false,
  storage,
  sessionStorage
}: {
  accountId: string;
  accountEmail?: string | null;
  portfolioIds?: string[];
  cloudSnapshotScopes?: string[];
  preserveWriteQueue?: boolean;
  clearCurrentSession?: boolean;
  storage?: Storage | null;
  sessionStorage?: Storage | null;
}) {
  const targetStorage = storage ?? browserStorage("localStorage");
  const targetSessionStorage = sessionStorage ?? browserStorage("sessionStorage");
  const removed: string[] = [];
  if (targetStorage) {
    const accountKeys = new Set([
      `numa:state:user-${accountId}`,
      `numa:onboarding:seen:${accountId}`,
      `numa:onboarding-flow:${accountId}`,
      `numa:onboarding-flow:v2:${accountId}`,
      ...(clearCurrentSession ? CURRENT_SESSION_KEYS : []),
      ...cloudSnapshotScopes.map(cloudSnapshotCacheKey)
    ]);
    const portfolioExactKeys = new Set(
      portfolioIds.map((portfolioId) => `numa:csvPreset:${portfolioId}`)
    );
    const portfolioPrefixes = portfolioIds.flatMap((portfolioId) => [
      `numa:autosnap:${portfolioId}:`
    ]);
    const encodedAccountId = encodeURIComponent(accountId);
    for (const key of storageKeys(targetStorage)) {
      const isAccountQueue =
        !preserveWriteQueue &&
        isScopedWriteQueueKeyForOwner(key, encodedAccountId);
      if (
        accountKeys.has(key) ||
        isAccountCacheKeyForOwner(key, accountId) ||
        portfolioExactKeys.has(key) ||
        portfolioPrefixes.some((prefix) => key.startsWith(prefix)) ||
        isAccountQueue
      ) {
        targetStorage.removeItem(key);
        removed.push(key);
      }
    }
    removed.push(...clearLegacyPortfolioCaches(targetStorage, portfolioIds));
    removeAccountQuota(targetStorage, accountId);
    removeAccountFeedback(targetStorage, accountEmail);
  }
  if (targetSessionStorage && clearCurrentSession) {
    targetSessionStorage.removeItem("numa:onboarding:force");
  }
  return removed;
}

function isScopedWriteQueueKeyForOwner(key: string, encodedAccountId: string) {
  if (key.startsWith(WRITE_QUEUE_STORAGE_PREFIX)) {
    const namespace = key.slice(WRITE_QUEUE_STORAGE_PREFIX.length).split(":");
    return namespace.length === 2 && namespace[1] === encodedAccountId;
  }
  if (key.startsWith(WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX)) {
    const namespace = key.slice(WRITE_QUEUE_SCOPED_QUARANTINE_PREFIX.length).split(":");
    return namespace.length >= 3 && namespace[1] === encodedAccountId;
  }
  return false;
}

function removeAccountQuota(storage: Storage, accountId: string) {
  const key = "numa:scan-quota:v1";
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "[]") as Array<{ userId?: unknown }>;
    if (!Array.isArray(parsed)) return;
    const next = parsed.filter((entry) => entry?.userId !== accountId);
    if (next.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(next));
  } catch {
    /* malformed legacy quota state is not safe to rewrite */
  }
}

function removeAccountFeedback(storage: Storage, accountEmail?: string | null) {
  if (!accountEmail) return;
  const key = "numa:feedback:v1";
  const normalizedEmail = accountEmail.trim().toLowerCase();
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "[]") as Array<{
      accountEmail?: unknown;
    }>;
    if (!Array.isArray(parsed)) return;
    const next = parsed.filter(
      (entry) =>
        typeof entry?.accountEmail !== "string" ||
        entry.accountEmail.trim().toLowerCase() !== normalizedEmail
    );
    if (next.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(next));
  } catch {
    /* malformed legacy feedback state is not safe to rewrite */
  }
}

function storageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function browserStorage(kind: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}
