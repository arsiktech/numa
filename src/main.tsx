import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { router } from "./App";
import { AuthProvider } from "./services/auth";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { schedulePwaRegistration } from "@/lib/pwa";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { applyAppMode, getStoredAppMode } from "@/lib/appMode";
import { applyThemeKey, getStoredThemeKey } from "@/lib/themeKey";
import { installAssetReloadRecovery } from "@/lib/assetReload";
import { bumpInstallSession, captureInstallPrompt } from "@/lib/installPrompt";
import { activateFontStylesheets } from "@/lib/fontCss";
import { installErrorReporting } from "@/lib/errorReporting";
import "./styles/global.css";

// Resolve and apply theme + palette + app-mode BEFORE React mounts so users
// don't get a flash of the wrong canvas / shell on first paint.
installAssetReloadRecovery();
installErrorReporting();
// Chromium can fire `beforeinstallprompt` before first render — capture early.
captureInstallPrompt();
bumpInstallSession();
activateFontStylesheets();
applyTheme(getStoredTheme());
applyThemeKey(getStoredThemeKey());
applyAppMode(getStoredAppMode());

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Numa root element not found");

// MotionConfig "user" hooks framer-motion into prefers-reduced-motion. Without
// it, every motion.div page-wrapper / dialog spring / progress bar fires
// regardless of the user's accessibility preference. Single wrap covers all
// framer-motion in the app; CSS keyframes are gated separately in global.css.
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>
);

schedulePwaRegistration();
