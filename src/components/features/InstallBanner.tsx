import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, X } from "lucide-react";
import { toastMotion } from "@/lib/motion";
import {
  dismissInstall,
  getInstallState,
  promptInstall,
  subscribeInstallPrompt
} from "@/lib/installPrompt";

/**
 * Contextual PWA install nudge. Renders nothing until the user's 3rd session,
 * and only when there is a real install path: a captured Chromium
 * `beforeinstallprompt` (Install button replays it) or iOS Safari (manual
 * "Add to Home Screen" hint — iOS has no programmatic prompt). Dismissing
 * (or declining the native prompt) hides it permanently via localStorage;
 * installing hides it via the `appinstalled` event.
 */
export function InstallBanner() {
  const state = useSyncExternalStore(subscribeInstallPrompt, getInstallState);

  if (!state.eligible || !(state.canPrompt || state.isIos)) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="install-banner"
        {...toastMotion}
        className="px-4 sm:px-6 lg:px-8 pt-4"
      >
        <div className="w-full">
          <div className="nm-glass-strong rounded-2xl border border-[color:var(--color-brand-soft)] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] shrink-0">
              <Download size={17} strokeWidth={1.75} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                {state.canPrompt
                  ? "Numa Pro works as an app — install it?"
                  : "Add Numa Pro to your Home Screen"}
              </p>
              <p className="text-[12px] text-[color:var(--color-ink-3)]">
                {state.canPrompt ? (
                  "Full screen, its own icon, works offline."
                ) : (
                  <>
                    Tap the Share button{" "}
                    <Share size={12} className="inline -mt-0.5" aria-hidden="true" /> in
                    Safari, then &ldquo;Add to Home Screen&rdquo;.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={dismissInstall}
                aria-label="Dismiss"
                className="grid place-items-center w-9 h-9 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-negative)] hover:border-[color:var(--color-negative-soft)] transition-colors"
              >
                <X size={14} />
              </button>
              {state.canPrompt ? (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] text-[13px] font-semibold hover:bg-[color:var(--color-brand-strong)] transition-colors"
                >
                  <Download size={14} />
                  Install
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
