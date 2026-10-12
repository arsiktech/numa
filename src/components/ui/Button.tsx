import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  // CTA and its foreground form a semantic contrast pair in every palette.
  primary:
    "bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] hover:brightness-[1.03] shadow-[var(--shadow-sm)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
  secondary:
    "bg-[color:var(--color-glass)] text-[color:var(--color-ink)] border border-[color:var(--color-line-glass)] backdrop-blur-xl hover:bg-[color:var(--color-glass-strong)] shadow-[var(--shadow-sm)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
  ghost:
    "bg-transparent text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-cream-100)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
  danger:
    "bg-[color:var(--color-negative)] text-[color:var(--color-on-negative)] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[color:var(--color-negative-soft)]"
};

// sm = 36px (was 32 → fails WCAG 2.5.5 strictly; 36 + 8px gap is the realistic
// floor). md = 44 (touch target). lg = 54 matches the design's hero CTA height.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[12px] rounded-lg",
  md: "h-11 px-4 text-[13px] rounded-xl",
  lg: "h-[54px] px-5 text-[15px] font-semibold rounded-2xl"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 max-w-full font-medium tracking-[-0.005em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        "nm-interactive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--color-ink)]",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
