import { motion } from "framer-motion";
import { useLocale } from "@/lib/i18n";
import { cardEnter } from "@/lib/motion";
import type { MoneyPod } from "@/lib/types";
import { PodSwitcher } from "./PodSwitcher";

export function PodLoadingSurface({
  pod,
  switchablePods,
  onSwitch
}: {
  pod: MoneyPod;
  switchablePods: MoneyPod[];
  onSwitch: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <motion.div
      {...cardEnter}
      className="space-y-4"
    >
      <header className="nm-panel rounded-[24px] p-3 sm:p-4">
        <div className="min-w-0">
          <p className="nm-eyebrow">{t("pod.sharedPot")}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {switchablePods.length > 1 ? (
                <PodSwitcher pod={pod} pods={switchablePods} onSwitch={onSwitch} />
              ) : (
                <h1
                  className="block w-full max-w-full truncate text-[22px] sm:text-[26px] font-bold tracking-[-0.025em] leading-tight text-[color:var(--color-ink)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {pod.name}
                </h1>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-10 w-[92px] rounded-2xl nm-loading-skeleton" />
              <div className="h-10 w-10 rounded-2xl nm-loading-skeleton" />
            </div>
          </div>
        </div>
      </header>

      <section
        className="nm-panel-strong rounded-[24px] p-4 sm:p-5 min-h-[196px] lg:min-h-[210px]"
        aria-busy="true"
        aria-label={t("pod.loadingData")}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-cta-ink)]/65"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {t("pod.balance")}
        </p>
        <div className="mt-3 h-12 w-full max-w-[520px] rounded-2xl nm-loading-skeleton" />
        <div className="mt-3 h-9 w-40 rounded-2xl nm-loading-skeleton" />
        <div className="mt-4 h-3 w-full max-w-[300px] rounded-full nm-loading-skeleton" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-10 rounded-2xl nm-loading-skeleton" />
          <div className="h-10 rounded-2xl nm-loading-skeleton" />
        </div>
      </section>

      <section className="nm-panel rounded-[24px] p-3 sm:p-4">
        <div className="grid gap-2">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-14 rounded-2xl border border-[color:var(--color-line)] nm-loading-skeleton"
            />
          ))}
        </div>
      </section>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* First-run                                                                   */
/* -------------------------------------------------------------------------- */

