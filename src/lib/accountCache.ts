export const ACCOUNT_CACHE_PREFIX = "numa:account-cache:v1:";
export const ACCOUNT_CACHE_QUARANTINE_KEY = "numa:account-cache:quarantine:v1";
export const ACCOUNT_CACHE_DEPLOYMENT =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() || "unknown-convex";

export interface AccountCacheScope {
  ownerId: string;
  deployment: string;
}

export function accountCacheScope(
  ownerId: string | null | undefined,
  deployment = ACCOUNT_CACHE_DEPLOYMENT
): AccountCacheScope | null {
  if (!ownerId || ownerId === "cloud-loading") return null;
  return { ownerId, deployment };
}

export function accountPortfolioCacheKey(
  scope: AccountCacheScope,
  area: "chat" | "thread" | "thread-index",
  portfolioId: string,
  suffix?: string
) {
  const base = `${ACCOUNT_CACHE_PREFIX}${encodeURIComponent(scope.deployment)}:${encodeURIComponent(scope.ownerId)}:${area}:${encodeURIComponent(portfolioId)}`;
  return suffix ? `${base}:${encodeURIComponent(suffix)}` : base;
}

export function isAccountCacheKeyForOwner(key: string, ownerId: string) {
  if (!key.startsWith(ACCOUNT_CACHE_PREFIX)) return false;
  const namespace = key.slice(ACCOUNT_CACHE_PREFIX.length).split(":");
  return namespace[1] === encodeURIComponent(ownerId);
}

interface QuarantinedAccountCacheEntry {
  key: string;
  raw: string;
  quarantinedAt: number;
}

function isLegacyPortfolioCacheKey(key: string, portfolioId: string) {
  return key === `numa:chat:${portfolioId}` ||
    key === `numa:threads:index:${portfolioId}` ||
    key.startsWith(`numa:threads:${portfolioId}:`);
}

export function clearLegacyPortfolioCaches(
  storage: Storage,
  portfolioIds: string[]
) {
  if (portfolioIds.length === 0) return [] as string[];
  const removed: string[] = [];
  const matchesTarget = (key: string) =>
    portfolioIds.some((portfolioId) => isLegacyPortfolioCacheKey(key, portfolioId));

  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && matchesTarget(key)) {
      storage.removeItem(key);
      removed.push(key);
    }
  }

  const quarantineRaw = storage.getItem(ACCOUNT_CACHE_QUARANTINE_KEY);
  if (quarantineRaw === null) return removed;
  try {
    const parsed = JSON.parse(quarantineRaw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Malformed account cache quarantine");
    const retained = parsed.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const key = (entry as Partial<QuarantinedAccountCacheEntry>).key;
      return typeof key !== "string" || !matchesTarget(key);
    });
    if (retained.length === parsed.length) return removed;
    if (retained.length === 0) storage.removeItem(ACCOUNT_CACHE_QUARANTINE_KEY);
    else storage.setItem(ACCOUNT_CACHE_QUARANTINE_KEY, JSON.stringify(retained));
    removed.push(ACCOUNT_CACHE_QUARANTINE_KEY);
  } catch {
    // A malformed mixed-account quarantine cannot be safely attributed. It is
    // less safe to retain potentially deleted-account transcripts indefinitely.
    storage.removeItem(ACCOUNT_CACHE_QUARANTINE_KEY);
    removed.push(ACCOUNT_CACHE_QUARANTINE_KEY);
  }
  return removed;
}

export function quarantineLegacyPortfolioCaches(
  storage: Storage,
  portfolioId: string,
  now = Date.now()
) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isLegacyPortfolioCacheKey(key, portfolioId)) keys.push(key);
  }
  if (keys.length === 0) return 0;

  try {
    const parsed = JSON.parse(storage.getItem(ACCOUNT_CACHE_QUARANTINE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return 0;
    const entries = parsed.filter(
      (entry): entry is QuarantinedAccountCacheEntry =>
        Boolean(
          entry &&
          typeof entry === "object" &&
          typeof (entry as QuarantinedAccountCacheEntry).key === "string" &&
          typeof (entry as QuarantinedAccountCacheEntry).raw === "string"
        )
    );
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (raw !== null) byKey.set(key, { key, raw, quarantinedAt: now });
    }
    const nextRaw = JSON.stringify([...byKey.values()]);
    storage.setItem(ACCOUNT_CACHE_QUARANTINE_KEY, nextRaw);
    if (storage.getItem(ACCOUNT_CACHE_QUARANTINE_KEY) !== nextRaw) return 0;
    for (const key of keys) storage.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}
