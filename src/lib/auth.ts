import type { CurrencyCode } from "./money";

export interface CachedCloudAccount {
  id: string;
  email: string | null;
  displayName: string;
  defaultCurrency: CurrencyCode;
  createdAt: number;
}

export interface AuthState {
  accounts: CachedCloudAccount[];
  currentAccountId: string | null;
}

const STORAGE_KEY = "numa:auth:v1";

export function loadAuthState(): AuthState {
  if (typeof window === "undefined") return { accounts: [], currentAccountId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accounts: [], currentAccountId: null };
    const parsed = JSON.parse(raw) as AuthState & { accounts?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.accounts)) return { accounts: [], currentAccountId: null };
    const accounts = parsed.accounts.flatMap((account) => {
      const legacy = account as unknown as Record<string, unknown>;
      const email = typeof legacy.email === "string" ? legacy.email : null;
      if (legacy[["is", "G", "uest"].join("")] === true) return [];
      if (email?.endsWith("@numa.local")) return [];
      if (typeof legacy.id !== "string") return [];
      return [
        {
          id: legacy.id,
          email,
          displayName:
            typeof legacy.displayName === "string" ? legacy.displayName : email ?? "You",
          defaultCurrency:
            legacy.defaultCurrency === "USD" || legacy.defaultCurrency === "EUR"
              ? legacy.defaultCurrency
              : "EUR",
          createdAt: typeof legacy.createdAt === "number" ? legacy.createdAt : Date.now()
        } satisfies CachedCloudAccount
      ];
    });
    const currentAccountId = accounts.some((a) => a.id === parsed.currentAccountId)
      ? parsed.currentAccountId
      : null;
    const sanitized = { accounts, currentAccountId };
    // Remove old photo payloads/capabilities from disk as well as memory.
    saveAuthState(sanitized);
    return sanitized;
  } catch {
    return { accounts: [], currentAccountId: null };
  }
}

export function saveAuthState(state: AuthState) {
  if (typeof window === "undefined") return;
  try {
    const accounts = state.accounts.map(account => ({
      id: account.id, email: account.email, displayName: account.displayName,
      defaultCurrency: account.defaultCurrency, createdAt: account.createdAt
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ accounts, currentAccountId: state.currentAccountId }));
  } catch {
    /* ignore quota */
  }
}

export function userStateKey(accountId: string) {
  return `numa:state:user-${accountId}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function removeAccount(state: AuthState, accountId: string): AuthState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(userStateKey(accountId));
    } catch {
      /* ignore */
    }
  }
  const accounts = state.accounts.filter((a) => a.id !== accountId);
  const currentAccountId =
    state.currentAccountId === accountId ? accounts[0]?.id ?? null : state.currentAccountId;
  return { accounts, currentAccountId };
}
