import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { DialogLoadingFallback } from "@/components/layout/DialogLoadingFallback";
import { FloatingAddFab } from "@/components/layout/FloatingAddFab";
import { ProximityDocks } from "@/components/layout/ProximityDocks";
import { PendingInvitesBanner } from "@/components/features/PendingInvitesBanner";
import { DeletionScheduledBanner } from "@/components/features/DeletionScheduledBanner";
import { InstallBanner } from "@/components/features/InstallBanner";
import { onCommand } from "@/lib/commands";
import { useAppMode, type AppMode } from "@/lib/appMode";
import { useMarketSync } from "@/hooks/useMarketSync";
import { useAutoSnapshots } from "@/hooks/useAutoSnapshots";
import { useFxRates } from "@/services/fxSync";
import { useAuth } from "@/services/auth";
import { UndoToastProvider } from "@/services/undo";
import { hasSeenOnboarding, markOnboardingSeen } from "@/lib/onboarding";
import { cn } from "@/lib/cn";

const LazyImportExportDialog = lazy(() =>
  import("@/components/features/ImportExportDialog").then((module) => ({
    default: module.ImportExportDialog
  }))
);

const LazyOnboardingTour = lazy(() =>
  import("@/components/features/OnboardingTour").then((module) => ({
    default: module.OnboardingTour
  }))
);

export function AppLayout() {
  const market = useMarketSync();
  useAutoSnapshots();
  const fx = useFxRates();
  const location = useLocation();
  const { currentAccount } = useAuth();
  const [appMode] = useAppMode();
  const [importOpen, setImportOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const isSharedSurface = (appMode === "shared" && location.pathname === "/") || location.pathname === "/pod";
  const isLightHome = appMode === "light" && location.pathname === "/";
  const isSettingsReferenceSurface =
    location.pathname === "/settings" && (appMode === "advanced" || appMode === "shared");
  const isAdvancedReferenceSurface =
    appMode === "advanced" &&
    (location.pathname === "/" ||
      location.pathname === "/numa" ||
      location.pathname === "/goals" ||
      location.pathname === "/insights");
  const routeIndex = getMobileRouteIndex(appMode, location.pathname);
  const routeKey = `${appMode}:${location.pathname}`;
  const previousRoute = useRef({ key: routeKey, index: routeIndex });
  let routeDirection: "forward" | "back" | "same" = "same";

  if (previousRoute.current.key !== routeKey) {
    routeDirection =
      routeIndex > previousRoute.current.index
        ? "forward"
        : routeIndex < previousRoute.current.index
          ? "back"
          : "same";
    previousRoute.current = { key: routeKey, index: routeIndex };
  }

  useEffect(() => onCommand("import-export", () => setImportOpen(true)), []);

  // First launch now lands directly on the working Overview. The contextual
  // action dock teaches setup in-place, while the full tour remains available
  // from Settings for users who explicitly ask for it.
  useEffect(() => {
    if (!currentAccount) return;
    if (currentAccount.id === "cloud-loading") return;
    if (window.sessionStorage.getItem("numa:onboarding:force") === "1") {
      window.sessionStorage.removeItem("numa:onboarding:force");
      setTourOpen(true);
      return;
    }
    if (!hasSeenOnboarding(currentAccount.id)) {
      markOnboardingSeen(currentAccount.id);
    }
  }, [currentAccount]);

  function closeTour() {
    if (currentAccount && currentAccount.id !== "cloud-loading") {
      markOnboardingSeen(currentAccount.id);
    }
    setTourOpen(false);
  }

  return (
    // UndoToastProvider MUST wrap the entire AppLayout — including BottomNav
    // and FloatingAddFab — because the FAB opens AddTransactionDialog which
    // mounts CategoryDialog, and that one calls useUndo(). If we wrap only
    // the <Outlet>, tapping "+" anywhere crashes the route with "useUndo
    // must be used inside <UndoToastProvider>".
    <UndoToastProvider>
      <div className="min-h-screen lg:min-h-[100dvh] flex">
        {isSharedSurface ? null : <Sidebar />}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0",
            isSharedSurface
              ? ""
              : appMode === "light"
                ? "lg:pl-[236px]"
                : "lg:pl-[264px]"
          )}
        >
          {/* TopBar is desktop-only now — mobile drops the header entirely
              and exposes Search + Add + Numa + Voice + Scan via the
              FloatingAddFab cluster pinned to the bottom-right. */}
          {isSharedSurface || isLightHome || isAdvancedReferenceSurface || isSettingsReferenceSurface || location.pathname === "/money" ? null : <TopBar showPeriodSwitcher />}
          <DeletionScheduledBanner />
          <PendingInvitesBanner />
          <InstallBanner />
          {fx.status !== "current" && !fx.loading ? (
            <p role="status" className="px-4 sm:px-6 py-2 text-sm text-[color:var(--color-ink-2)]">
              Currency conversion unavailable.{fx.asOf ? ` Last verified rates: ${fx.asOf}.` : ""} Same-currency amounts remain available.
            </p>
          ) : null}
          {market.failedSymbols.length || market.unavailable.length ? (
            <p role="status" className="px-4 sm:px-6 py-2 text-sm text-[color:var(--color-ink-2)]">
              Market prices unavailable for {[...new Set([...market.failedSymbols, ...market.unavailable])].join(", ")}.
              {market.oldestRetainedAt ? ` Saved quotes are from ${new Date(market.oldestRetainedAt).toLocaleString()}.` : ""}
            </p>
          ) : null}
          {/* Mobile keeps room for bottom nav/FAB. Desktop keeps content tight
              to the viewport so pages don't get artificial extra scroll. */}
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5 lg:pt-5 pb-[max(env(safe-area-inset-bottom),24px)] lg:pb-8">
            <div
              key={routeKey}
              data-route-direction={routeDirection}
              className="nm-route-surface w-full pb-[calc(env(safe-area-inset-bottom,0px)+124px)] lg:pb-0"
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {/* BottomNav + FAB cluster are fixed-positioned children of the
          provider tree so the dialogs they open (CategoryDialog, etc.) can
          read the undo context. */}
      <BottomNav />
      <FloatingAddFab />
      <ProximityDocks />
      {importOpen ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazyImportExportDialog open={importOpen} onClose={() => setImportOpen(false)} />
        </Suspense>
      ) : null}
      {tourOpen ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazyOnboardingTour open={tourOpen} onClose={closeTour} />
        </Suspense>
      ) : null}
    </UndoToastProvider>
  );
}

function getMobileRouteIndex(mode: AppMode, pathname: string): number {
  const normalizedPath =
    pathname === "/shared" || pathname === "/pod"
      ? "/"
      : pathname.startsWith("/settings")
        ? "/settings"
        : pathname;

  if (mode === "shared") {
    return routeIndexOrFallback(["/", "/settings"], normalizedPath);
  }
  if (mode === "advanced") {
    return routeIndexOrFallback(["/", "/money", "/numa", "/goals", "/settings"], normalizedPath);
  }
  return routeIndexOrFallback(["/", "/buckets", "/money", "/settings"], normalizedPath);
}

function routeIndexOrFallback(order: string[], pathname: string): number {
  const index = order.indexOf(pathname);
  return index === -1 ? order.length : index;
}
