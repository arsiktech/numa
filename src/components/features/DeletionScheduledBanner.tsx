import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Hourglass, TriangleAlert, Undo2 } from "lucide-react";
import { toastMotion } from "@/lib/motion";
import { useMutation, useQuery } from "convex/react";
import { useLocale, type I18nKey } from "@/lib/i18n";
import { cloudAvailable } from "@/services/cloudStore";
import { api } from "../../../convex/_generated/api";
import {
  cancellationResultPhase,
  resolveDeletionBannerView,
  type DeletionBannerPhase
} from "./deletionBannerState";

// The deletion.* locale keys are merged into src/lib/locales/*.ts by the
// release tooling alongside this component (locale files are not edited
// here). The cast keeps the strict I18nKey check satisfied; `t()` falls back
// to the raw key string if ever rendered before the dictionaries land.
const bannerKey = (key: string) => key as I18nKey;

/**
 * Sticky banner shown while the signed-in account has a pending 7-day
 * deletion grace window (`profiles.me().deletionScheduledAt`). One primary
 * action — cancel the deletion — which hides the warning optimistically and
 * confirms with a short success card. Renders nothing when no deletion is
 * scheduled.
 */
export function DeletionScheduledBanner() {
  if (!cloudAvailable) return null;
  return <CloudDeletionScheduledBanner />;
}

function CloudDeletionScheduledBanner() {
  const { locale, t } = useLocale();
  const me = useQuery(api.profiles.me);
  const cancelDeletion = useMutation(api.users.cancelMyDeletion);
  const [phase, setPhase] = useState<DeletionBannerPhase>("idle");

  const scheduledAt = me?.deletionScheduledAt ?? null;
  const startedAt = me?.deletionStartedAt ?? null;
  const view = resolveDeletionBannerView({ phase, scheduledAt, startedAt });
  const showWarning = view === "warning" || view === "canceling";
  const showSuccess = view === "canceled";
  const showAlreadyStarted = view === "already-started";
  const showAlreadyDeleted = view === "already-deleted";

  async function handleCancel() {
    setPhase("canceling");
    try {
      const result: unknown = await cancelDeletion();
      const resultPhase = cancellationResultPhase(result);
      setPhase(resultPhase);
      if (resultPhase === "canceled") {
        window.setTimeout(() => setPhase("hidden"), 3200);
      }
    } catch (err) {
      console.error("[deletion] cancel failed:", err);
      // Revert so the warning (and the retry path) comes back.
      setPhase("idle");
    }
  }

  const dateLabel =
    scheduledAt !== null
      ? new Date(scheduledAt).toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric"
        })
      : "";

  return (
    <AnimatePresence>
      {showWarning ? (
        <motion.div
          key="deletion-banner"
          {...toastMotion}
          className="px-4 sm:px-6 lg:px-8 pt-4"
        >
          <div className="w-full">
            <div className="nm-glass-strong rounded-2xl border border-[color:var(--color-negative-soft)] p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-[color:var(--color-negative)] text-[color:var(--color-cta-ink)] shrink-0">
                <Hourglass size={17} strokeWidth={1.75} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                  {t(bannerKey("deletion.bannerTitle")).replace("{date}", dateLabel)}
                </p>
                <p className="text-[12px] text-[color:var(--color-ink-3)]">
                  {t(bannerKey("deletion.bannerBody"))}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                disabled={view === "canceling"}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] text-[13px] font-semibold hover:bg-[color:var(--color-brand-strong)] transition-colors shrink-0"
              >
                <Undo2 size={14} />
                {t(
                  bannerKey(
                    view === "canceling"
                      ? "deletion.bannerCanceling"
                      : "deletion.bannerCancel"
                  )
                )}
              </button>
            </div>
          </div>
        </motion.div>
      ) : showSuccess ? (
        <motion.div
          key="deletion-canceled"
          {...toastMotion}
          className="px-4 sm:px-6 lg:px-8 pt-4"
        >
          <div className="w-full">
            <div className="nm-glass-strong rounded-2xl border border-[color:var(--color-brand-soft)] p-3 sm:p-4 flex items-center gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] shrink-0">
                <Check size={17} strokeWidth={1.75} />
              </span>
              <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                {t(bannerKey("deletion.bannerCanceled"))}
              </p>
            </div>
          </div>
        </motion.div>
      ) : showAlreadyStarted || showAlreadyDeleted ? (
        <motion.div
          key="deletion-already-deleted"
          {...toastMotion}
          className="px-4 sm:px-6 lg:px-8 pt-4"
        >
          <div className="w-full">
            <div className="nm-glass-strong rounded-2xl border border-[color:var(--color-negative-soft)] p-3 sm:p-4 flex items-center gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-[color:var(--color-negative)] text-[color:var(--color-cta-ink)] shrink-0">
                <TriangleAlert size={17} strokeWidth={1.75} />
              </span>
              <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
                {t(bannerKey(
                  showAlreadyStarted
                    ? "deletion.bannerAlreadyStarted"
                    : "deletion.bannerAlreadyDeleted"
                ))}
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
