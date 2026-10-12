import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone =
  | "neutral"
  | "positive"
  | "negative"
  | "info"
  | "warning"
  | "brand"
  | "lavender"
  | "mint"
  | "peach"
  | "blush"
  | "sky"
  | "sand";

const toneStyles: Record<PillTone, string> = {
  neutral:
    "bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-2)] border-[color:var(--color-line)]",
  positive:
    "bg-[color:var(--color-positive-soft)] text-[color:var(--color-positive)] border-[color:var(--color-positive)]/15",
  negative:
    "bg-[color:var(--color-negative-soft)] text-[color:var(--color-negative)] border-[color:var(--color-negative)]/15",
  info: "bg-[color:var(--color-info-soft)] text-[color:var(--color-info)] border-[color:var(--color-info)]/15",
  warning:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)] border-[color:var(--color-warning)]/15",
  brand:
    "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand-strong)] border-[color:var(--color-brand)]/15",
  lavender:
    "bg-[color:var(--color-lavender-100)] text-[color:var(--color-brand-strong)] border-[color:var(--color-lavender-300)]/20",
  mint:
    "bg-[color:var(--color-mint-100)] text-[color:var(--color-positive)] border-[color:var(--color-mint-300)]/30",
  peach:
    "bg-[color:var(--color-peach-100)] text-[color:var(--color-peach-ink)] border-[color:var(--color-peach-300)]/30",
  blush:
    "bg-[color:var(--color-blush-100)] text-[color:var(--color-negative)] border-[color:var(--color-blush-300)]/30",
  sky:
    "bg-[color:var(--color-sky-100)] text-[color:var(--color-info)] border-[color:var(--color-sky-300)]/30",
  sand:
    "bg-[color:var(--color-sand-100)] text-[color:var(--color-sand-ink)] border-[color:var(--color-sand-300)]/40"
};

export function Pill({
  children,
  tone = "neutral",
  className,
  onClick,
  active,
  ariaLabel
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  ariaLabel?: string;
}) {
  const base = cn("nm-pill border", toneStyles[tone], className);
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active ? true : undefined}
        aria-label={ariaLabel}
        className={cn(
          base,
          "cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand)]/40",
          active
            ? "ring-2 ring-[color:var(--color-brand)]/50 scale-[1.04] shadow-[var(--shadow-sm)]"
            : ""
        )}
      >
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}
