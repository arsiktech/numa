import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { motion, AnimatePresence } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import { CategoryIcon, tonesFor } from "@/components/features/CategoryIcon";
import type { Category } from "@/lib/types";
import { ReceiptText } from "lucide-react";

import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";

import { backdropMotion, DUR, EASE_OUT } from "@/lib/motion";
export function Sheet({
  open,
  onClose,
  title,
  children,
  width = 440
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const { t } = useLocale();
  useBodyScrollLock(open);
  const [visualViewport, setVisualViewport] = useState<{
    height: number;
    offsetTop: number;
  } | null>(null);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    function update() {
      const current = window.visualViewport;
      setVisualViewport({
        height: Math.floor(current?.height ?? window.innerHeight),
        offsetTop: Math.floor(current?.offsetTop ?? 0)
      });
    }
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  const sheetMaxHeight = visualViewport
    ? `min(${Math.max(320, visualViewport.height - 24)}px, 920px)`
    : "min(calc(100dvh - 24px), 920px)";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-x-0 top-0 z-[80] flex items-end justify-center px-3 sm:items-center sm:p-4"
          style={
            visualViewport
              ? {
                  height: `${visualViewport.height}px`,
                  top: `${visualViewport.offsetTop}px`
                }
              : undefined
          }
          {...backdropMotion}
        >
          <button
            type="button"
            aria-label={t("pod.close")}
            onClick={onClose}
            className="absolute inset-0 z-0 bg-[color:var(--color-ink)]/35"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 18 }}
            animate={{ y: 0 }}
            exit={{ y: 14 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
            className="relative z-10 w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-[28px] bg-[color:var(--color-paper)] p-4 shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.25)] sm:rounded-3xl sm:p-6"
            style={{
              maxWidth: `min(${width}px, 100%)`,
              maxHeight: sheetMaxHeight
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-[20px] font-bold tracking-[-0.02em] text-[color:var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("pod.close")}
                className="h-9 w-9 grid place-items-center rounded-full hover:bg-[color:var(--color-cream-50)] text-[color:var(--color-ink-2)]"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/* ---- Expense ---- */

export function SetupField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[11.5px] text-[color:var(--color-ink-3)] leading-snug">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main surface                                                                */
/* -------------------------------------------------------------------------- */

export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)] mb-2"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export function ChipScroller({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>;
}

export function ScenarioButton({
  selected,
  icon: Icon,
  title,
  detail,
  onClick
}: {
  selected: boolean;
  icon: LucideIcon;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-left transition-colors",
        selected
          ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand-soft)]"
          : "border-[color:var(--color-line)] bg-[color:var(--color-bg)] hover:border-[color:var(--color-line-strong)]"
      )}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--color-ink)]">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-xl",
            selected
              ? "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]"
              : "bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)]"
          )}
        >
          <Icon size={15} />
        </span>
        <span className="min-w-0 leading-tight">{title}</span>
      </span>
      <span className="mt-0.5 block text-[11px] text-[color:var(--color-ink-3)]">
        {detail}
      </span>
    </button>
  );
}

export function Chip({
  children,
  selected,
  onClick
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 px-3.5 rounded-full border text-[13px] font-medium transition-colors",
        selected
          ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)] border-[color:var(--color-ink)]"
          : "bg-[color:var(--color-bg)] text-[color:var(--color-ink-2)] border-[color:var(--color-line)] hover:border-[color:var(--color-line-strong)]"
      )}
    >
      {children}
    </button>
  );
}

/* ---- Settle Sheet ---- */

export function CategoryPill({
  category,
  label,
  inferred
}: {
  category?: Category;
  label: string;
  inferred?: boolean;
}) {
  const { t } = useLocale();
  const tone = category ? tonesFor(category.color) : null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color:var(--color-line)] px-2 py-1 text-[10.5px] font-semibold text-[color:var(--color-ink-2)]"
      style={{
        background: tone?.surface ?? "var(--color-paper)",
        color: tone?.ink ?? "var(--color-ink-3)"
      }}
    >
      {category ? <CategoryIcon name={category.icon} size={12} /> : <ReceiptText size={12} />}
      <span className="truncate">{label}</span>
      {inferred && category ? (
        <span className="text-[9px] uppercase opacity-65">{t("pod.auto")}</span>
      ) : null}
    </span>
  );
}

export const podInputClass =
  "w-full min-h-[46px] rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[15px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]";
