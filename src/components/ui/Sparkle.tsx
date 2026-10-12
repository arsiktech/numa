import { cn } from "@/lib/cn";

interface SparkleProps {
  /** Pixel size of the SVG square. Default 14 — matches the Numa design book. */
  size?: number;
  /** Fill colour. Defaults to `currentColor` so parents control via text-color. */
  color?: string;
  className?: string;
  /** Aria label. Sparkle is decorative on most surfaces; set when it carries meaning. */
  ariaLabel?: string;
}

/**
 * The 4-point Numa sparkle ✦ — the "AI tell".
 *
 * Per CLAUDE.md design contract:
 *   • Only used on AI surfaces. Anywhere else is a bug — use a regular
 *     Lucide icon instead.
 *   • One sparkle per screen, ideally.
 *
 * The path traces a thick diamond/star: four cardinal points + four mid
 * inflections, all converging on (12, 12). Matches the SVG in the design
 * handoff's `themes.jsx`.
 */
export function Sparkle({ size = 14, color, className, ariaLabel }: SparkleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color ?? "currentColor"}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
      className={cn(className)}
    >
      <path d="M12 0 L13.5 9 L24 12 L13.5 15 L12 24 L10.5 15 L0 12 L10.5 9 Z" />
    </svg>
  );
}
