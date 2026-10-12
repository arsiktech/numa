/**
 * Pod switcher popover used by both the mobile header and the desktop rail.
 * Extracted from the former `page.tsx`.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { splitPodRailName } from "@/lib/podRailName";
import { useLocale } from "@/lib/i18n";
import type { MoneyPod } from "@/lib/types";

export function PodSwitcher({
  pod,
  pods,
  onSwitch
}: {
  pod: MoneyPod;
  pods: MoneyPod[];
  onSwitch: (id: string) => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const railName = splitPodRailName(pod.name);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    function positionPanel() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(window.innerWidth - 24, Math.max(rect.width, 320));
      setCoords({
        top: rect.bottom + 8,
        left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
        width
      });
    }

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: string) {
    onSwitch(id);
    setOpen(false);
  }

  const panel =
    open && coords
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={t("pod.sharedPots")}
            className="fixed z-[70] nm-popover"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="max-h-[min(420px,60dvh)] overflow-auto rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-2 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.36)] backdrop-blur-xl">
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-4)]">
                {t("pod.sharedPots")}
              </div>
              <div className="space-y-1">
                {pods.map((item) => {
                  const active = item.id === pod.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(item.id)}
                      className={cn(
                        "nm-interactive grid w-full min-h-[54px] grid-cols-[1fr_auto] items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                        active
                          ? "bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]"
                          : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-100)]"
                      )}
                    >
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[15px] font-bold tracking-[-0.01em]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {item.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--color-ink-4)]">
                          {item.currency}
                        </span>
                      </span>
                      {active ? (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]">
                          <Check size={15} strokeWidth={2.5} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "nm-interactive grid w-full grid-cols-[1fr_auto] items-start gap-3 rounded-[18px] border border-[color:var(--color-line)]",
          "bg-[color:var(--color-bg)] px-3 py-3 text-left shadow-[var(--shadow-sm)]",
          "hover:bg-[color:var(--color-paper)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand)]/35"
        )}
      >
        <span className="min-w-0">
          {railName.context ? (
            <span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-ink-4)]">
              {railName.context}
            </span>
          ) : null}
          <span
            className="mt-1 block overflow-hidden break-words py-px text-[14.5px] font-bold leading-[1.28] tracking-[-0.01em] text-[color:var(--color-ink)]"
            style={{
              display: "-webkit-box",
              fontFamily: "var(--font-display)",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2
            }}
            title={pod.name}
          >
            {railName.label}
          </span>
          <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
            {pods.length} pots · {pod.currency}
          </span>
        </span>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)]">
          <ChevronDown
            size={16}
            className={cn("transition-transform", open ? "rotate-180" : "")}
          />
        </span>
      </button>
      {panel}
    </>
  );
}
