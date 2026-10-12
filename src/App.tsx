import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useLocation, useRouteError } from "react-router-dom";
import { LoadingSurface } from "@/components/layout/LoadingSurface";
import { AppLayout } from "./routes/layout";
import { RequireAuth } from "./routes/auth/RequireAuth";
import { StoreProvider, useNuma } from "./services/store";
import { CloudDataProvider, useCloudState } from "./services/cloudStore";
import { WriteQueueProvider } from "./services/writeQueue";
import { useAuth } from "./services/auth";
import WelcomePage from "./routes/welcome/page";
import { useAppMode, type AppMode } from "./lib/appMode";
import {
  clearPendingOnboardingFlow,
  getPendingOnboardingFlow,
  hasCompletedOnboardingFlow,
  markOnboardingFlowComplete
} from "./lib/onboardingFlow";
import { usePushProfile } from "./lib/profileSync";
import {
  isAssetReloadInProgress,
  isRecoverableAssetLoadError,
  reloadOnceForAssetError
} from "./lib/assetReload";
import { reportError } from "./lib/errorReporting";

function lazyRoute<T extends { default: ComponentType<unknown> }>(
  importer: () => Promise<T>
) {
  return lazy(() =>
    importer().catch((error: unknown) => {
      if (isRecoverableAssetLoadError(error)) {
        if (isAssetReloadInProgress() || reloadOnceForAssetError()) {
          return new Promise<T>(() => undefined);
        }
      }
      throw error;
    })
  );
}

const LightHomePage = lazyRoute(() => import("./routes/home-light/page"));
const MoneyPage = lazyRoute(() => import("./routes/money/page"));
const BucketsPage = lazyRoute(() => import("./routes/buckets/page"));
const NumaPage = lazyRoute(() => import("./routes/advanced/NumaPage"));
const GoalsPage = lazyRoute(() => import("./routes/advanced/GoalsPage"));
const InsightsPage = lazyRoute(() => import("./routes/advanced/InsightsPage"));
const PodPage = lazyRoute(() => import("./routes/pod/page"));
const SettingsPage = lazyRoute(() => import("./routes/settings/page"));
const LandingPage = lazyRoute(() => import("./routes/landing/page"));
const TermsPage = lazyRoute(() => import("./routes/legal/TermsPage"));
const PrivacyPage = lazyRoute(() => import("./routes/legal/PrivacyPage"));
const ModeScreen = lazyRoute(() => import("./routes/onboarding/ModeScreen"));
const SetupScreen = lazyRoute(() => import("./routes/onboarding/SetupScreen"));
const ReadyScreen = lazyRoute(() => import("./routes/onboarding/ReadyScreen"));
const NEW_PROVIDER_ACCOUNT_WINDOW_MS = 1000 * 60 * 10;

function RouteFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return <LoadingSurface compact={!fullScreen} className={fullScreen ? undefined : "py-12"} />;
}

function CloudStartupGate({ children }: { children: ReactNode }) {
  const cloud = useCloudState();
  if (cloud.enabled && cloud.loading) return <RouteFallback fullScreen />;
  return <>{children}</>;
}

function RouteErrorFallback() {
  const error = useRouteError();
  const isRecoverableAssetError = isRecoverableAssetLoadError(error);
  const [recoveringAsset, setRecoveringAsset] = useState(
    () => isRecoverableAssetError && isAssetReloadInProgress()
  );

  useEffect(() => {
    if (!isRecoverableAssetError) {
      setRecoveringAsset(false);
      reportError(error, "route");
      return;
    }
    if (isAssetReloadInProgress() || reloadOnceForAssetError()) {
      setRecoveringAsset(true);
    }
  }, [error, isRecoverableAssetError]);

  if (recoveringAsset) return <RouteFallback fullScreen />;

  const message = error instanceof Error ? error.message : String(error ?? "Unknown route error");
  return (
    <div
      role="alert"
      className="fixed inset-0 z-[9999] grid place-items-center bg-[color:var(--color-bg)] px-5 text-[color:var(--color-ink)]"
    >
      <div className="w-full max-w-[420px] space-y-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[color:var(--color-negative)]">
          Route error
        </p>
        <h1
          className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Numa Pro needs a reload.
        </h1>
        <p className="text-[14px] leading-[1.5] text-[color:var(--color-ink-2)]">
          Your data is safe in Numa Pro cloud. Reload the app and try again.
        </p>
        <details className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] px-3 py-2 text-[11px] text-[color:var(--color-ink-3)]">
          <summary className="cursor-pointer select-none">Error details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.5]">
            {message}
          </pre>
        </details>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold transition hover:brightness-105 active:scale-[0.99]"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

const routeErrorElement = <RouteErrorFallback />;

function ProtectedRoot() {
  return (
    <RequireAuth>
      {/* CloudDataProvider sits OUTSIDE StoreProvider so useNuma can read cloud
          state via useContext. Without Convex, it's a thin no-op shell.
          RequireOnboarding sits INSIDE StoreProvider so it can read state for
          the "existing data → skip onboarding" backfill. */}
      <CloudDataProvider>
        <CloudStartupGate>
          <StoreProvider>
            <WriteQueueProvider>
              <RequireOnboarding>
                <AppLayout />
              </RequireOnboarding>
            </WriteQueueProvider>
          </StoreProvider>
        </CloudStartupGate>
      </CloudDataProvider>
    </RequireAuth>
  );
}

/**
 * Renders the new design-faithful HomePage for every appMode. The AI nudge
 * card inside HomePage hides itself when mode === "light". The legacy
 * OverviewPage is no longer routed — its rich Net-Worth / Holdings / Goals
 * widgets live on /wealth.
 *
 * Shared mode skips the personal home entirely and renders the Pod page
 * directly — that mode's whole reason for existing is the joint pot.
 */
function WealthRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/", search: location.search }} replace />;
}

function HomeRouter() {
  const [mode] = useAppMode();
  return (
    <Suspense fallback={<RouteFallback />}>
      {mode === "shared" ? <PodPage /> : <LightHomePage />}
    </Suspense>
  );
}

/**
 * Route gate: children render only while the app is in one of `modes`;
 * everything else lands back on the home route for its own mode instead of a
 * blank or confusing screen. Advanced-only routes pass ["advanced"];
 * personal surfaces (Money, Buckets) pass ["light", "advanced"] because the
 * shared-pot workflow is intentionally one-screen.
 */
function RequireMode({ modes, children }: { modes: AppMode[]; children: ReactNode }) {
  const [mode] = useAppMode();
  if (!modes.includes(mode)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Standard suspense wrapper for a lazily-imported page. */
const page = (el: ReactNode) => <Suspense fallback={<RouteFallback />}>{el}</Suspense>;

/** Auth + onboarding-entry gated page (the onboarding flow's own screens). */
const onboardingPage = (el: ReactNode) => (
  <RequireAuth>
    <RequireOnboardingEntry>{page(el)}</RequireOnboardingEntry>
  </RequireAuth>
);

/**
 * Gate that runs INSIDE ProtectedRoot — at this point we have a currentAccount
 * AND a hydrated store. Routes the post-OAuth user through the onboarding
 * flow on their first session, then directly home on every subsequent visit.
 *
 * Pre-feature users (existing accounts with data) get an automatic backfill:
 * if their store already has portfolios/transactions, we mark onboarding
 * complete on first mount so they never see the new flow.
 */
function RequireOnboarding({ children }: { children: ReactNode }) {
  const { currentAccount } = useAuth();
  const { state } = useNuma();
  const pushProfile = usePushProfile();

  // Backfill: ONLY users who have user-entered data (transactions / holdings /
  // money pods) skip onboarding. The seeded starter state — one "Personal"
  // portfolio plus a $0 Cash asset that `provisionStateForCloud` writes for
  // every fresh OAuth user — does NOT count, otherwise brand-new accounts
  // would bypass the flow they just signed up to see.
  const hasRealData =
    state.transactions.length > 0 ||
    state.holdings.length > 0 ||
    state.moneyPods.length > 0;
  const localCompleted = hasCompletedOnboardingFlow(currentAccount?.id);
  const cloudCompleted = Boolean(currentAccount?.onboardingCompletedAt);
  const pendingOnboarding = getPendingOnboardingFlow();
  const accountAgeMs = currentAccount?.createdAt ? Date.now() - currentAccount.createdAt : Infinity;
  const isLikelyNewProviderAccount =
    pendingOnboarding === "provider" &&
    accountAgeMs < NEW_PROVIDER_ACCOUNT_WINDOW_MS;
  const shouldRunOnboarding =
    pendingOnboarding === "signUp" || isLikelyNewProviderAccount;

  useEffect(() => {
    if (!currentAccount?.id) return;
    if (currentAccount.id === "cloud-loading") return;
    if (localCompleted && cloudCompleted) {
      clearPendingOnboardingFlow();
      return;
    }
    if (cloudCompleted && !localCompleted) {
      markOnboardingFlowComplete(currentAccount.id);
      return;
    }
    if (localCompleted && !cloudCompleted) {
      pushProfile({ onboardingCompletedAt: Date.now() });
      clearPendingOnboardingFlow();
      return;
    }
    if (hasRealData || !shouldRunOnboarding) {
      markOnboardingFlowComplete(currentAccount.id);
      pushProfile({ onboardingCompletedAt: Date.now() });
      clearPendingOnboardingFlow();
    }
  }, [
    cloudCompleted,
    currentAccount?.id,
    hasRealData,
    localCompleted,
    pushProfile,
    shouldRunOnboarding
  ]);

  if (!currentAccount?.id) return <>{children}</>;
  // Returning password/session users can render the app shell immediately
  // while Convex hydrates the profile; the shared surface can use its local
  // cloud snapshot and revalidate in the background. Fresh signups/OAuth
  // still stay behind the loader so onboarding does not flash the wrong UI.
  if (currentAccount.id === "cloud-loading") {
    return pendingOnboarding === null ? <>{children}</> : <RouteFallback fullScreen />;
  }
  if (localCompleted || cloudCompleted) return <>{children}</>;
  // Existing-data path above is handled in the useEffect; if we got here
  // with no real data and no explicit fresh-signup marker, remember this
  // existing cloud account as onboarded and let them in.
  if (hasRealData || !shouldRunOnboarding) return <>{children}</>;
  return <Navigate to="/onboarding/mode" replace />;
}

function RequireOnboardingEntry({ children }: { children: ReactNode }) {
  const { currentAccount } = useAuth();
  if (!currentAccount) return <Navigate to="/welcome" replace />;
  if (currentAccount.id === "cloud-loading") return <RouteFallback fullScreen />;

  const localCompleted = hasCompletedOnboardingFlow(currentAccount.id);
  const cloudCompleted = Boolean(currentAccount.onboardingCompletedAt);
  const pendingOnboarding = getPendingOnboardingFlow();
  const accountAgeMs = currentAccount.createdAt ? Date.now() - currentAccount.createdAt : Infinity;
  const shouldRunOnboarding =
    pendingOnboarding === "signUp" ||
    (pendingOnboarding === "provider" && accountAgeMs < NEW_PROVIDER_ACCOUNT_WINDOW_MS);

  if (localCompleted || cloudCompleted || !shouldRunOnboarding) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/welcome",
    errorElement: routeErrorElement,
    element: page(<WelcomePage />)
  },
  {
    path: "/onboarding/style",
    errorElement: routeErrorElement,
    element: onboardingPage(<Navigate to="/onboarding/mode" replace />)
  },
  {
    path: "/onboarding/mode",
    errorElement: routeErrorElement,
    element: onboardingPage(<ModeScreen />)
  },
  {
    path: "/onboarding/setup",
    errorElement: routeErrorElement,
    element: onboardingPage(<SetupScreen />)
  },
  {
    path: "/onboarding/ready",
    errorElement: routeErrorElement,
    element: onboardingPage(<ReadyScreen />)
  },
  {
    path: "/landing",
    errorElement: routeErrorElement,
    element: page(<LandingPage />)
  },
  {
    path: "/terms",
    errorElement: routeErrorElement,
    element: page(<TermsPage />)
  },
  {
    path: "/privacy",
    errorElement: routeErrorElement,
    element: page(<PrivacyPage />)
  },
  // Legacy /login and /signup routes were folded into /welcome — the
  // welcome screen now hosts Apple + Google OAuth and an inline email
  // login form. Old bookmarks land on the right place via redirects.
  { path: "/login", element: <Navigate to="/welcome" replace /> },
  { path: "/signup", element: <Navigate to="/welcome" replace /> },
  {
    path: "/",
    errorElement: routeErrorElement,
    element: <ProtectedRoot />,
    children: [
      {
        index: true,
        element: <HomeRouter />
      },
      {
        path: "money",
        element: (
          <RequireMode modes={["light", "advanced"]}>{page(<MoneyPage />)}</RequireMode>
        )
      },
      {
        path: "buckets",
        element: (
          <RequireMode modes={["light", "advanced"]}>{page(<BucketsPage />)}</RequireMode>
        )
      },
      {
        // Wealth merged into the home Balance view (2026-10-11). Old links,
        // including ?add=… intents, land on the home screen.
        path: "wealth",
        element: <WealthRedirect />
      },
      {
        // Numa Pro OS — the conversational money surface. No AI_ENABLED gate any
        // more: the day threads, briefs, catalog, and local drafting are fully
        // deterministic; only live chat + image generation light up with AI.
        path: "numa",
        element: <RequireMode modes={["advanced"]}>{page(<NumaPage />)}</RequireMode>
      },
      {
        path: "goals",
        element: <RequireMode modes={["advanced"]}>{page(<GoalsPage />)}</RequireMode>
      },
      {
        path: "insights",
        element: <RequireMode modes={["advanced"]}>{page(<InsightsPage />)}</RequireMode>
      },
      {
        // Legacy alias. The advanced "Shared" surface was just a re-render of
        // the pod page; /pod is now the single shared-money route, so keep old
        // deep links working with a redirect.
        path: "shared",
        element: <Navigate to="/pod" replace />
      },
      {
        // Always-on direct link to the shared-pot UI. Useful when an Advanced
        // user wants the minimal one-screen view without switching modes
        // (e.g. a quick "log a household coffee" tap).
        path: "pod",
        element: page(<PodPage />)
      },
      {
        path: "settings",
        element: page(<SettingsPage />)
      }
    ]
  }
]);
