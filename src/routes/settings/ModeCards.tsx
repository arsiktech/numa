import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import {
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/Button";

import { cn } from "@/lib/cn";

import { useAppMode, type AppMode } from "@/lib/appMode";

import { usePushProfile } from "@/lib/profileSync";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

import { MODE_META } from "./shared";
export function CurrentModeCard({
  meta,
  onSwitch
}: {
  meta: (typeof MODE_META)[AppMode];
  onSwitch: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSwitch}
      className="nm-balance-row-button flex w-full items-center gap-3 border-y border-[color:var(--color-ink)] py-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-[color:var(--color-ink-3)]">Current mode</span>
        <span className="mt-0.5 block text-[18px] font-semibold text-[color:var(--color-ink)]">{meta.title}</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-[color:var(--color-ink-2)]">{meta.description}</span>
      </span>
      <span className="nm-balance-add inline-flex items-center">Switch</span>
    </button>
  );
}

export function ModeSwitchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useAppMode();
  const pushProfile = usePushProfile();
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  function pickMode(next: AppMode) {
    if (next === mode) {
      onClose();
      return;
    }
    setMode(next);
    pushProfile({ appMode: next });
    onClose();
    if (next === "shared") {
      navigate("/", { replace: true });
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-[color:var(--color-scrim)] backdrop-blur-[2px]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Switch mode"
        className="fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[min(88dvh,640px)] w-full max-w-[430px] overflow-y-auto overscroll-contain rounded-t-[24px] bg-[color:var(--color-bg)] px-[22px] pb-[max(env(safe-area-inset-bottom),24px)] pt-3 shadow-[0_-24px_58px_-18px_rgba(0,0,0,0.45)]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[color:var(--color-line-strong)]" />
        <h2
          className="text-[21px] font-bold tracking-[-0.03em] text-[color:var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Switch mode
        </h2>
        <p className="mt-1 text-[13px] font-medium leading-relaxed text-[color:var(--color-ink-3)]">
          Your data stays put. Tap the surface that matches what you are trying to do next.
        </p>
        <div className="mt-4 space-y-2.5">
          {(["light", "advanced", "shared"] as AppMode[]).map((key) => {
            const item = MODE_META[key];
            const active = key === mode;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pickMode(key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
                  active
                    ? "border-[color:var(--color-cta-ink)] bg-[color:var(--color-brand-mist)]"
                    : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] hover:border-[color:var(--color-line-strong)]"
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-[22px]",
                    active
                      ? "bg-[color:var(--color-cta)]"
                      : "bg-[color:var(--color-cream-100)]"
                  )}
                >
                  {item.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[17px] font-bold leading-tight tracking-[-0.02em] text-[color:var(--color-ink)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[color:var(--color-ink-3)]">
                    {item.description}
                  </span>
                  <span className="mt-1 block text-[11.5px] font-semibold leading-snug text-[color:var(--color-ink-2)]">
                    {item.firstMove}
                  </span>
                </span>
                {active ? (
                  <span className="rounded-full bg-[color:var(--color-cta-ink)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.1em] text-[color:var(--color-ink)]">
                    current
                  </span>
                ) : (
                  <ChevronRight size={18} className="text-[color:var(--color-ink-4)]" />
                )}
              </button>
            );
          })}
        </div>
        <Button type="button" variant="primary" className="mt-4 w-full" onClick={onClose}>
          Done
        </Button>
      </section>
    </>,
    document.body
  );
}

