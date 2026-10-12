import type { CSSProperties } from "react";
import type { Transition } from "framer-motion";

/**
 * Numa's motion language — the single source of truth.
 *
 * Production had 11 distinct durations and 7 easings hand-copied across 30+
 * framer `transition` props, five backdrop variants, and three different
 * sheet entrances. This module collapses them to one vocabulary, mirrored by
 * the CSS custom properties in `styles/tokens.css` (keep both in sync):
 *
 *   EASE_OUT  ↔ --ease-out-quart   the house ease: settles fast, lands soft
 *   EASE_POP  ↔ --ease-spring      overshoot for sheets/badges ("alive")
 *   EASE_LUX  ↔ --ease-lux         route morphs & reveals ("lens refocus")
 *   EASE_DRAW ↔ --ease-draw        chart line draw-on
 *
 * Timing tiers (seconds, framer-side):
 *   instant 0.12 — hover/press feedback
 *   fast    0.18 — backdrops, popovers
 *   card    0.24 — cards, list items, toasts
 *   sheet   0.24 — dialogs & bottom sheets
 *   page    0.22 — page wrappers
 *   slow    0.48 — hero/marketing only
 *
 * Derived from the design prototype's animation engine (numa-kit.jsx: nmFade
 * 600ms in-view card reveal, nmGrow 900ms bars, nmDraw 1150ms charts, nmPop
 * 500ms badges, 900ms count-ups) — the CSS classes nm-reveal-up / nm-grow-x /
 * nm-chart-draw / nm-pop in global.css carry those in-view patterns; this
 * file carries the React/framer side. prefers-reduced-motion is handled
 * globally by <MotionConfig reducedMotion="user"> in main.tsx.
 */

export const EASE_OUT = [0.25, 1, 0.5, 1] as const;
export const DUR = {
  instant: 0.12,
  fast: 0.18,
  card: 0.24,
  sheet: 0.24,
  page: 0.22,
  slow: 0.48
} as const;

/** Page wrapper enter — every routed surface uses exactly this. */
export const pageEnter = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.page, ease: EASE_OUT } satisfies Transition
} as const;

/** Card / panel / toast enter (slightly quicker than the page around it). */
export const cardEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.card, ease: EASE_OUT } satisfies Transition
} as const;

/** The house backdrop fade for every dialog/sheet/search overlay. */
export const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.fast, ease: EASE_OUT } satisfies Transition
} as const;

/**
 * The house sheet entrance: quick, calm rise. Bottom sheets, center dialogs,
 * capture panels — one body language everywhere.
 */
export const sheetMotion = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 18 },
  transition: { duration: DUR.sheet, ease: EASE_OUT } satisfies Transition
} as const;

/** Toast/banner pop (undo, pending invites). */
export const toastMotion = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
  transition: { duration: DUR.card, ease: EASE_OUT } satisfies Transition
} as const;

/** Segmented-control pill / shared-layout slides. */
export const SPRING_PILL: Transition = { type: "spring", stiffness: 420, damping: 34 };

/** Optional welcome artwork follows the pointer, then settles without a loop. */
export const SPRING_GLASS = { stiffness: 190, damping: 24, mass: 0.8 } as const;

/**
 * Staggered children: spread `staggerContainer` on the parent and
 * `staggerItem` on each child. 45ms steps — perceptible rhythm without lag.
 */
/**
 * Inline style for CSS-driven staggered reveals (`.nm-reveal-up`,
 * `.nm-slice-pop` read `--nm-delay`). Index-based so lists ripple in.
 */
export function revealDelay(index: number, stepMs = 60): CSSProperties {
  // CSS custom properties aren't in React's CSSProperties index — cast once
  // here so every call site stays clean.
  return { "--nm-delay": `${Math.max(0, index) * stepMs}ms` } as CSSProperties;
}
