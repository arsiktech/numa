import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LoadingSurface } from "@/components/layout/LoadingSurface";
import {
  loadAuthState,
  normalizeEmail,
  removeAccount,
  saveAuthState,
  type AuthState
} from "@/lib/auth";
import {
  APP_MODE_CHANGE_EVENT,
  applyAppMode,
  getStoredAppModeUpdatedAt,
  setStoredAppMode,
  type AppMode
} from "@/lib/appMode";
import {
  applyThemeKey,
  setStoredThemeKey,
  type AppThemeKey
} from "@/lib/themeKey";
import { applyTheme, setStoredTheme, type Theme } from "@/lib/theme";
import { setStoredLocale } from "@/lib/i18n";
import {
  clearPendingOnboardingFlow,
  getPendingOnboardingFlow,
  markPendingOnboardingFlow
} from "@/lib/onboardingFlow";
import { buildReturningProfileBootstrapArgs } from "@/lib/profileBootstrap";
import { clearPendingProfileStash } from "@/lib/profileStash";
import { clearAccountLocalData } from "@/lib/accountLocalData";
import { cloudSnapshotScopeForAccount } from "@/lib/cloudStartup";
import type { AppLocale, CurrencyCode } from "@/lib/types";

const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "";
const cloudFlag = (import.meta.env.VITE_NUMA_CLOUD_AUTH as string | undefined) === "1";
export const convex = cloudFlag && convexUrl ? new ConvexReactClient(convexUrl) : null;
export const isCloudEnabled = Boolean(convex);
export const AUTH_SESSION_TRANSITION_EVENT = "numa:auth-session-transition";
const LOCAL_PROFILE_PREF_GRACE_MS = 60_000;

function emitAuthSessionTransition(state: "leaving" | "settled") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_SESSION_TRANSITION_EVENT, { detail: { state } })
  );
}

export interface AuthAccount {
  id: string;
  email: string | null;
  displayName: string;
  defaultCurrency: CurrencyCode;
  appMode?: AppMode;
  isCloud: boolean;
  avatarUrl?: string;
  hasCloudProfile: boolean;
  onboardingCompletedAt?: number | null;
  createdAt: number;
}

interface AuthContextValue {
  state: AuthState;
  currentAccount: AuthAccount | null;
  /**
   * Resolves "verification-pending" when the deployment requires email
   * verification and the account's email is not confirmed yet — the user must
   * complete verifyEmail() before a session exists. "ok" means signed in.
   */
  signIn: (email: string, password: string) => Promise<"ok" | "verification-pending">;
  signUp: (input: {
    email: string;
    displayName: string;
    password: string;
    defaultCurrency: CurrencyCode;
  }) => Promise<"ok" | "verification-pending">;
  /** Trigger OAuth redirect to the named provider. Resolves on return. */
  signInWithProvider: (provider: "google" | "apple") => Promise<void>;
  /** Link the currently signed-in account to an OAuth provider. */
  linkProvider: (provider: "google" | "apple") => Promise<void>;
  signOut: () => Promise<void>;
  switchAccount: (accountId: string) => void;
  deleteAccount: (accountId: string) => Promise<void>;
  /** True when this deployment can send password-reset emails (AUTH_RESEND_KEY set). */
  passwordResetEnabled: boolean;
  /** Email the user an 8-digit reset code. Requires passwordResetEnabled. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Verify the emailed code and set a new password. */
  confirmPasswordReset: (input: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
  /**
   * True when this deployment confirms emails at sign-up (AUTH_RESEND_KEY
   * set). Optional-copy only — the server decides whether verification
   * actually happens; never gate the flow on this client-side.
   */
  emailVerificationEnabled: boolean;
  /**
   * Confirm the 8-digit code emailed at sign-up. "ok" signs the user in;
   * a wrong or expired code resolves "invalid-code" (no throw).
   */
  verifyEmail: (email: string, code: string) => Promise<"ok" | "invalid-code">;
  /** Re-send the sign-up verification code to the given email. */
  resendVerification: (email: string) => Promise<void>;
  /** True when this deployment has Google OAuth credentials configured. */
  googleOAuthEnabled: boolean;
  /** True when this deployment has Apple OAuth credentials configured. */
  appleOAuthEnabled: boolean;
}

const Ctx = createContext<AuthContextValue | null>(null);

// Outer provider that owns the Convex client wrapper.
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return <CloudConfigRequired />;
  }
  return (
    <ConvexAuthProvider client={convex}>
      <CloudAuthProvider>{children}</CloudAuthProvider>
    </ConvexAuthProvider>
  );
}

function CloudConfigRequired() {
  return (
    <div className="min-h-screen grid place-items-center bg-[color:var(--color-bg)] px-6 text-[color:var(--color-ink)]">
      <div className="max-w-[460px] rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-6 shadow-[var(--shadow-sm)]">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-negative)]">
          Cloud auth required
        </p>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.03em]">
          Configure Convex to run Numa Pro.
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-[color:var(--color-ink-3)]">
          This build no longer mounts the legacy local account fallback. Set
          <code className="mx-1 rounded bg-[color:var(--color-cream-50)] px-1.5 py-0.5 text-[12px]">
            VITE_NUMA_CLOUD_AUTH=1
          </code>
          and
          <code className="mx-1 rounded bg-[color:var(--color-cream-50)] px-1.5 py-0.5 text-[12px]">
            VITE_CONVEX_URL
          </code>
          to a dev or production Convex deployment.
        </p>
      </div>
    </div>
  );
}

// Cloud-backed provider - Convex Auth handles password + sessions; profile and
// starter portfolio provisioning live in Convex.
function CloudAuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn: convexSignIn, signOut: convexSignOut } = useAuthActions();
  const profile = useQuery(api.profiles.me);
  const authFlags = useQuery(api.authConfig.flags);
  const portfoliosForCleanup = useQuery(
    api.portfolios.listMine,
    isAuthenticated ? {} : "skip"
  );
  const ensureProfile = useMutation(api.profiles.ensureProfile);
  const deleteMyAccountMutation = useMutation(api.users.deleteMyAccount);

  // Local state mirrors cloud accounts only for account-switching metadata.
  const [localState, setLocalState] = useState<AuthState>(() => loadAuthState());
  const [pendingSignUp, setPendingSignUp] = useState<null | {
    displayName: string;
    defaultCurrency: CurrencyCode;
  }>(null);
  const [loadingEmailHint, setLoadingEmailHint] = useState<string | null>(null);
  const localModeEditedRef = useRef(false);
  const hydratingModeRef = useRef(false);

  useEffect(() => {
    function markLocalModeEdit() {
      if (!hydratingModeRef.current) {
        localModeEditedRef.current = true;
      }
    }
    window.addEventListener(APP_MODE_CHANGE_EVENT, markLocalModeEdit);
    return () => window.removeEventListener(APP_MODE_CHANGE_EVENT, markLocalModeEdit);
  }, []);

  useEffect(() => {
    saveAuthState(localState);
  }, [localState]);

  useEffect(() => {
    if (!profile?.id) return;
    const cachedAccount = {
      id: profile.id,
      email: profile.email ?? null,
      displayName: profile.displayName || profile.name || profile.email || "You",
      defaultCurrency: (profile.defaultCurrency as CurrencyCode) ?? "EUR",
      createdAt: profile.createdAt
    };
    setLoadingEmailHint(null);
    setLocalState((prev) => {
      const existingIndex = prev.accounts.findIndex((account) => account.id === profile.id);
      const existing = existingIndex >= 0 ? prev.accounts[existingIndex] : null;
      const unchanged =
        prev.currentAccountId === profile.id &&
        existing?.email === cachedAccount.email &&
        existing?.displayName === cachedAccount.displayName &&
        existing?.defaultCurrency === cachedAccount.defaultCurrency &&
        existing?.createdAt === cachedAccount.createdAt;
      if (unchanged) return prev;
      const accounts =
        existingIndex >= 0
          ? prev.accounts.map((account, index) =>
              index === existingIndex ? cachedAccount : account
            )
          : [...prev.accounts, cachedAccount];
      return {
        accounts,
        currentAccountId: profile.id
      };
    });
  }, [
    profile?.createdAt,
    profile?.defaultCurrency,
    profile?.displayName,
    profile?.email,
    profile?.id,
    profile?.name
  ]);

  useEffect(() => {
    if (!isAuthenticated || !profile?.id) return;
    if (pendingSignUp) {
      // Convex profiles still narrow to USD|EUR — fall back to EUR for any
      // wider currency the client picked. The portfolio default can be wider.
      const profileCurrency: "USD" | "EUR" =
        pendingSignUp.defaultCurrency === "USD" ? "USD" : "EUR";
      ensureProfile({
        displayName: pendingSignUp.displayName,
        defaultCurrency: profileCurrency
      }).catch(() => {
        /* ignore — surfacing on next render */
      });
      setPendingSignUp(null);
    } else {
      const pendingOnboarding = getPendingOnboardingFlow();
      ensureProfile(buildReturningProfileBootstrapArgs({
        hasProfile: profile.hasProfile,
        pendingOnboarding,
        completedAt: Date.now()
      })).catch(() => {
        /* ignore */
      });
    }
  }, [isAuthenticated, profile, pendingSignUp, ensureProfile]);

  // Hydrate localStorage prefs (appMode / themeKey / theme) from the user's
  // Convex profile on every load. Cloud is the source of truth across
  // devices; local-only changes (made while offline or pre-sync) get
  // overwritten on next session — that's the desired "Settings on phone
  // reflects on web" behavior. One-shot per profile id change so we don't
  // ping-pong if the user is mid-edit on this device.
  const [hydratedForId, setHydratedForId] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    if (hydratedForId === profile.id) return;
    const profileAppMode = profile.appMode as AppMode | undefined;
    const localModeUpdatedAt = getStoredAppModeUpdatedAt();
    const hasFreshLocalMode =
      localModeUpdatedAt !== null &&
      Date.now() - localModeUpdatedAt < LOCAL_PROFILE_PREF_GRACE_MS;
    if (
      !localModeEditedRef.current &&
      !hasFreshLocalMode &&
      (profileAppMode === "light" || profileAppMode === "advanced" || profileAppMode === "shared")
    ) {
      hydratingModeRef.current = true;
      setStoredAppMode(profileAppMode);
      applyAppMode(profileAppMode);
      hydratingModeRef.current = false;
    }
    const profileThemeKey = profile.themeKey as AppThemeKey | undefined;
    if (
      profileThemeKey === "numa" ||
      profileThemeKey === "citrus" ||
      profileThemeKey === "pebble" ||
      profileThemeKey === "coral" ||
      profileThemeKey === "carbon"
    ) {
      // The legacy "numa" (Classic) palette is retired from the Settings
      // picker; normalize it to Citrus on hydrate so the picker always shows a
      // coherent active swatch instead of none (QA 2026-06-24).
      const normalizedThemeKey = profileThemeKey === "numa" ? "citrus" : profileThemeKey;
      setStoredThemeKey(normalizedThemeKey);
      applyThemeKey(normalizedThemeKey);
    }
    const profileTheme = profile.theme as Theme | undefined;
    if (profileTheme === "light" || profileTheme === "dark" || profileTheme === "auto") {
      setStoredTheme(profileTheme);
      applyTheme(profileTheme);
    }
    const profileLocale = profile.locale as AppLocale | null | undefined;
    if (profileLocale === "en" || profileLocale === "ru" || profileLocale === "es") {
      setStoredLocale(profileLocale);
    }
    setHydratedForId(profile.id);
  }, [profile, hydratedForId]);

  const cachedCurrentAccount = useMemo(
    () =>
      localState.currentAccountId
        ? localState.accounts.find((account) => account.id === localState.currentAccountId) ?? null
        : null,
    [localState.accounts, localState.currentAccountId]
  );

  const currentAccount = useMemo<AuthAccount | null>(() => {
    if (isAuthenticated) {
      // profile useQuery may still be in flight on the very first render after
      // sign-in / refresh-restore. Don't bounce the user back to /login during
      // that window — show a placeholder identity until the real profile
      // arrives.
      if (profile?.id) {
        return {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName || profile.name || (profile.email ?? "You"),
          defaultCurrency: (profile.defaultCurrency as CurrencyCode) ?? "EUR",
          appMode: profile.appMode as AppMode | undefined,
          isCloud: true,
          avatarUrl: profile.avatarUrl ?? undefined,
          hasCloudProfile: profile.hasProfile ?? true,
          onboardingCompletedAt: profile.onboardingCompletedAt ?? null,
          createdAt: profile.createdAt
        };
      }
      return {
        id: "cloud-loading",
        email: loadingEmailHint ?? cachedCurrentAccount?.email ?? null,
        displayName: cachedCurrentAccount?.displayName ?? "Loading…",
        defaultCurrency: cachedCurrentAccount?.defaultCurrency ?? "EUR",
        isCloud: true,
        avatarUrl: undefined,
        hasCloudProfile: false,
        onboardingCompletedAt: null,
        createdAt: cachedCurrentAccount?.createdAt ?? Date.now()
      };
    }
    return null;
  }, [cachedCurrentAccount, isAuthenticated, loadingEmailHint, profile]);

  const cleanupPortfolioIds = useMemo(
    () => (portfoliosForCleanup ?? []).map((entry) => String(entry.portfolio._id)),
    [portfoliosForCleanup]
  );
  const currentCloudSnapshotScope = useMemo(
    () => cloudSnapshotScopeForAccount(convexUrl, currentAccount),
    [currentAccount]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state: localState,
      currentAccount,
      async signIn(email, password) {
        const normalizedEmail = normalizeEmail(email);
        setLoadingEmailHint(normalizedEmail);
        clearPendingOnboardingFlow();
        setLocalState((prev) => ({ ...prev, currentAccountId: null }));
        try {
          const result = await convexSignIn("password", {
            email: normalizedEmail,
            password,
            flow: "signIn"
          });
          // With email verification configured server-side, a correct
          // password on an unverified account resolves { signingIn: false }
          // (no throw) and re-sends the confirmation code.
          if (result && !result.signingIn) return "verification-pending";
          return "ok";
        } catch (err) {
          setLoadingEmailHint(null);
          throw err;
        }
      },
      async signUp(input) {
        markPendingOnboardingFlow("signUp");
        setPendingSignUp({
          displayName: input.displayName,
          defaultCurrency: input.defaultCurrency
        });
        try {
          const result = await convexSignIn("password", {
            email: normalizeEmail(input.email),
            password: input.password,
            flow: "signUp",
            name: input.displayName
          });
          setLocalState((prev) => ({ ...prev, currentAccountId: null }));
          // Verification-gated deployments email a code instead of starting a
          // session — keep pendingSignUp so the post-verification
          // isAuthenticated effect still provisions the profile. (If the user
          // refreshes mid-verification the display name falls back to the
          // server default — acceptable.)
          if (result && !result.signingIn) return "verification-pending";
          return "ok";
        } catch (err) {
          clearPendingOnboardingFlow();
          setPendingSignUp(null);
          throw err;
        }
      },
      async signInWithProvider(provider) {
        markPendingOnboardingFlow("provider");
        // Convex Auth handles the OAuth redirect — this resolves AFTER the
        // round-trip back from Google/Apple lands the user with a session.
        await convexSignIn(provider);
        setLocalState((prev) => ({ ...prev, currentAccountId: null }));
      },
      async linkProvider(provider) {
        await convexSignIn(provider);
        setLocalState((prev) => ({ ...prev, currentAccountId: null }));
      },
      async signOut() {
        const leavingAccountId =
          profile?.id ??
          (currentAccount?.id && currentAccount.id !== "cloud-loading"
            ? currentAccount.id
            : null);
        clearPendingOnboardingFlow();
        // A profile write this account failed to push must not replay onto
        // whoever signs in next.
        clearPendingProfileStash();
        setLoadingEmailHint(null);
        emitAuthSessionTransition("leaving");
        try {
          await convexSignOut();
        } finally {
          if (leavingAccountId) {
            clearAccountLocalData({
              accountId: leavingAccountId,
              accountEmail: currentAccount?.email,
              preserveWriteQueue: true,
              clearCurrentSession: true,
              portfolioIds: cleanupPortfolioIds,
              cloudSnapshotScopes: currentCloudSnapshotScope
                ? [currentCloudSnapshotScope]
                : []
            });
            setLocalState((prev) => removeAccount(prev, leavingAccountId));
          } else {
            setLocalState((prev) => ({ ...prev, currentAccountId: null }));
          }
          emitAuthSessionTransition("settled");
        }
      },
      switchAccount(accountId) {
        setLocalState((prev) => ({ ...prev, currentAccountId: accountId }));
      },
      passwordResetEnabled: Boolean(authFlags?.passwordReset),
      async requestPasswordReset(email) {
        await convexSignIn("password", {
          email: normalizeEmail(email),
          flow: "reset"
        });
      },
      async confirmPasswordReset({ email, code, newPassword }) {
        await convexSignIn("password", {
          email: normalizeEmail(email),
          code,
          newPassword,
          flow: "reset-verification"
        });
        // Successful verification signs the user in with the new password.
        setLocalState((prev) => ({ ...prev, currentAccountId: null }));
      },
      emailVerificationEnabled: Boolean(authFlags?.emailVerification),
      googleOAuthEnabled: Boolean(authFlags?.googleOAuth),
      appleOAuthEnabled: Boolean(authFlags?.appleOAuth),
      async verifyEmail(email, code) {
        const result = await convexSignIn("password", {
          email: normalizeEmail(email),
          code,
          flow: "email-verification"
        });
        // A wrong/expired code resolves { signingIn: false } — no throw.
        if (!result?.signingIn) return "invalid-code";
        setLocalState((prev) => ({ ...prev, currentAccountId: null }));
        return "ok";
      },
      async resendVerification(email) {
        // flow "email-verification" with email but NO code re-sends the OTP.
        await convexSignIn("password", {
          email: normalizeEmail(email),
          flow: "email-verification"
        });
      },
      async deleteAccount(accountId) {
        // Only the current (authed) cloud account can hit the server mutation.
        // For other locally-cached accounts we can't impersonate from this
        // session, so we just clear local state.
        if (accountId === profile?.id) {
          // Mutation must run BEFORE signOut — once we drop the session there's
          // no authed identity to authorise the cascade delete with.
          emitAuthSessionTransition("leaving");
          try {
            await deleteMyAccountMutation();
            clearAccountLocalData({
              accountId,
              accountEmail: currentAccount?.email,
              clearCurrentSession: true,
              portfolioIds: cleanupPortfolioIds,
              cloudSnapshotScopes: currentCloudSnapshotScope
                ? [currentCloudSnapshotScope]
                : []
            });
            clearPendingProfileStash();
            await convexSignOut();
          } finally {
            emitAuthSessionTransition("settled");
          }
        }
        clearAccountLocalData({
          accountId,
          accountEmail: localState.accounts.find((account) => account.id === accountId)?.email,
          clearCurrentSession: accountId === profile?.id,
          portfolioIds: accountId === profile?.id ? cleanupPortfolioIds : [],
          cloudSnapshotScopes:
            accountId === profile?.id && currentCloudSnapshotScope
              ? [currentCloudSnapshotScope]
              : []
        });
        setLocalState((prev) => removeAccount(prev, accountId));
      }
    }),
    [authFlags?.appleOAuth, authFlags?.emailVerification, authFlags?.googleOAuth, authFlags?.passwordReset, cleanupPortfolioIds, convexSignIn, convexSignOut, currentAccount, currentCloudSnapshotScope, deleteMyAccountMutation, localState, profile]
  );

  if (isLoading) {
    return <LoadingSurface />;
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export { normalizeEmail };
