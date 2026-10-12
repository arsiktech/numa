import type {
  MoneyPod,
  PodExpense,
  PodGroup,
  PodMember,
  PodSettlement
} from "./types";

export interface CachedCloudPodData {
  pod: MoneyPod;
  members: PodMember[];
  groups: PodGroup[];
  expenses: PodExpense[];
  settlements: PodSettlement[];
}

export interface CachedCloudSnapshot {
  savedAt: number;
  moneyPods: MoneyPod[];
  byPod: Record<string, CachedCloudPodData>;
}

const CACHE_VERSION = 1;
const CACHE_PREFIX = "numa:cloud-snapshot";
const MAX_CACHE_CHARS = 3_500_000;
const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

interface CacheEnvelope {
  version: number;
  savedAt: number;
  moneyPods: unknown;
  byPod: unknown;
}

export function readCloudSnapshotCache(
  scope: string,
  options: {
    storage?: Storage;
    now?: number;
    maxAgeMs?: number;
  } = {}
): CachedCloudSnapshot | null {
  const storage = options.storage ?? browserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(cloudSnapshotCacheKey(scope));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope;
    if (envelope.version !== CACHE_VERSION) return null;
    const now = options.now ?? Date.now();
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    if (!Number.isFinite(envelope.savedAt) || now - envelope.savedAt > maxAgeMs) {
      return null;
    }
    if (!Array.isArray(envelope.moneyPods) || !isRecord(envelope.byPod)) return null;
    const moneyPods = envelope.moneyPods.filter(isMoneyPod);
    const byPod: Record<string, CachedCloudPodData> = {};
    for (const [podId, data] of Object.entries(envelope.byPod)) {
      if (isCachedPodData(data) && data.pod.id === podId) {
        byPod[podId] = data;
      }
    }
    if (moneyPods.length === 0 && Object.keys(byPod).length === 0) return null;
    return {
      savedAt: envelope.savedAt,
      moneyPods,
      byPod
    };
  } catch {
    return null;
  }
}

export function writeCloudSnapshotCache(
  scope: string,
  snapshot: Omit<CachedCloudSnapshot, "savedAt">,
  options: {
    storage?: Storage;
    now?: number;
  } = {}
): boolean {
  const storage = options.storage ?? browserStorage();
  if (!storage) return false;
  try {
    const envelope = {
      version: CACHE_VERSION,
      savedAt: options.now ?? Date.now(),
      moneyPods: snapshot.moneyPods,
      byPod: snapshot.byPod
    };
    const serialized = JSON.stringify(envelope);
    if (serialized.length > MAX_CACHE_CHARS) return false;
    storage.setItem(cloudSnapshotCacheKey(scope), serialized);
    return true;
  } catch {
    return false;
  }
}

export function cloudSnapshotCacheKey(scope: string) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${encodeURIComponent(scope)}`;
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string";
}

function hasNumber(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "number" && Number.isFinite(value[key]);
}

function isMoneyPod(value: unknown): value is MoneyPod {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "name") &&
    (value.currency === "USD" || value.currency === "EUR") &&
    hasString(value, "ownerUserId") &&
    hasNumber(value, "createdAt")
  );
}

function isPodMember(value: unknown): value is PodMember {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "podId") &&
    hasString(value, "displayName") &&
    (value.role === "owner" || value.role === "editor" || value.role === "viewer") &&
    hasNumber(value, "joinedAt")
  );
}

function isPodGroup(value: unknown): value is PodGroup {
  if (!isRecord(value)) return false;
  return hasString(value, "id") && hasString(value, "podId") && hasString(value, "name");
}

function isPodExpense(value: unknown): value is PodExpense {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "podId") &&
    hasString(value, "paidByMemberId") &&
    hasNumber(value, "amount") &&
    (value.currency === "USD" || value.currency === "EUR") &&
    hasString(value, "description") &&
    hasNumber(value, "occurredAt") &&
    Array.isArray(value.participantMemberIds)
  );
}

function isPodSettlement(value: unknown): value is PodSettlement {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "podId") &&
    hasString(value, "fromMemberId") &&
    hasString(value, "toMemberId") &&
    hasNumber(value, "amount") &&
    (value.currency === "USD" || value.currency === "EUR") &&
    hasNumber(value, "occurredAt")
  );
}

function isCachedPodData(value: unknown): value is CachedCloudPodData {
  if (!isRecord(value)) return false;
  return (
    isMoneyPod(value.pod) &&
    Array.isArray(value.members) &&
    value.members.every(isPodMember) &&
    Array.isArray(value.groups) &&
    value.groups.every(isPodGroup) &&
    Array.isArray(value.expenses) &&
    value.expenses.every(isPodExpense) &&
    Array.isArray(value.settlements) &&
    value.settlements.every(isPodSettlement)
  );
}
