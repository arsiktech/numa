import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

interface OnboardingLayoutProps {
  /** 1-based current step out of `total`. */
  step: number;
  total?: number;
  /** Wide keeps mobile behavior but gives web steps a horizontal canvas. */
  variant?: "narrow" | "wide";
  /** Optional back handler. When omitted the back button is hidden. */
  onBack?: () => void;
  /** Eyebrow text shown above the headline. */
  eyebrow?: string;
  /** Main h1 headline content (can include a highlighted span). */
  title: ReactNode;
  /** Optional sub-headline below the title. */
  subtitle?: ReactNode;
  /** Page body (the picker/CTA). */
  children: ReactNode;
}

/** Two-step setup. Allow vertical scrolling for small screens and enlarged text. */
export function OnboardingLayout({
  step,
  total = 2,
  variant = "narrow",
  onBack,
  eyebrow,
  title,
  subtitle,
  children
}: OnboardingLayoutProps) {
  const isWide = variant === "wide";

  return (
    <div
      className={
        isWide
          ? "min-h-[100svh] bg-[color:var(--color-bg)] text-[color:var(--color-ink)] flex justify-center sm:items-center px-5 py-4 sm:py-8 "
          : "min-h-[100svh] bg-[color:var(--color-bg)] text-[color:var(--color-ink)] flex justify-center px-5 py-4 sm:py-8 "
      }
    >
      <div
        className={
          isWide
            ? "w-full max-w-[420px] sm:max-w-[980px] flex flex-col gap-4 sm:gap-5 min-h-0"
            : "w-full max-w-[420px] flex flex-col gap-4 sm:gap-5 min-h-0"
        }
      >
        {/* Progress + back row */}
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="w-11 h-11 shrink-0 rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] grid place-items-center text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-50)] transition-colors"
            >
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
          ) : (
            <span className="w-9 h-9" aria-hidden />
          )}
          <div className="flex-1 flex gap-1.5">
            {Array.from({ length: total }, (_, i) => {
              const filled = i < step;
              return (
                <span
                  key={i}
                  className="flex-1 h-[3px] rounded-full"
                  style={{
                    background: filled
                      ? "var(--color-brand)"
                      : "var(--color-cream-100)"
                  }}
                  aria-hidden
                />
              );
            })}
          </div>
        </div>

        {/* Eyebrow */}
        {eyebrow ? (
          <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-[color:var(--color-ink-3)]">
            {eyebrow}
          </p>
        ) : null}

        {/* Title */}
        <h1
          className="text-[32px] sm:text-[36px] font-bold tracking-[-0.03em] leading-[1.05] text-[color:var(--color-ink)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>

        {/* Subtitle */}
        {subtitle ? (
          <p className="text-[14px] text-[color:var(--color-ink-3)] -mt-3">{subtitle}</p>
        ) : null}

        {/* Body */}
        <div className={isWide ? "nm-reveal flex flex-col gap-5 sm:gap-6 min-h-0" : "nm-reveal flex-1 flex flex-col gap-5"}>
          {children}
        </div>
      </div>
    </div>
  );
}
