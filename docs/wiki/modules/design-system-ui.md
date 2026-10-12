# Module: Design System And UI

Numa's UI system aims for "calm money": Citrus palette by default, compact controls, tokenized colors, one motion language, and decision-unit screens.

## Responsibilities

- Provide reusable primitives, app shell components, dialogs, charts, brand visuals, and global styles.
- Keep visual design tokenized across light/dark and palette themes.
- Keep motion centralized and reduced-motion safe.
- Keep common mobile/desktop workflows ergonomic, especially shared pod and quick capture.

## Key Files

- [`src/styles/tokens.css`](../../../src/styles/tokens.css), [`themes.css`](../../../src/styles/themes.css), [`global.css`](../../../src/styles/global.css) - token, theme, reset, utility and motion CSS.
- [`src/lib/motion.ts`](../../../src/lib/motion.ts) - canonical Framer Motion variants and timing.
- [`src/components/ui/Button.tsx`](../../../src/components/ui/Button.tsx), [`Card.tsx`](../../../src/components/ui/Card.tsx), [`Dialog.tsx`](../../../src/components/ui/Dialog.tsx), [`Avatar.tsx`](../../../src/components/ui/Avatar.tsx), [`Sparkle.tsx`](../../../src/components/ui/Sparkle.tsx) - primitives.
- [`src/components/layout/Sidebar.tsx`](../../../src/components/layout/Sidebar.tsx), [`BottomNav.tsx`](../../../src/components/layout/BottomNav.tsx), [`FloatingAddFab.tsx`](../../../src/components/layout/FloatingAddFab.tsx), [`ProximityDocks.tsx`](../../../src/components/layout/ProximityDocks.tsx) - navigation/action shell.
- [`src/components/charts/AllocationDonut.tsx`](../../../src/components/charts/AllocationDonut.tsx), [`NetWorthChart.tsx`](../../../src/components/charts/NetWorthChart.tsx), [`src/lib/chartMath.ts`](../../../src/lib/chartMath.ts) - local SVG charting.
- Design prototypes were removed from the repo (Sep 2026; recoverable from git history).

## Public API

- UI primitives and layout components are imported directly.
- `pageEnter`, `cardEnter`, `sheetMotion`, `backdropMotion`, `DUR`, `EASE_OUT` from `src/lib/motion.ts`.
- `cn()` from `src/lib/cn.ts`.

## Internal Structure

Global CSS defines the token language. Components use token-backed class names rather than literal colors. Shell components own navigation/action behavior. Feature dialogs live in `src/components/features`, not in primitives.

## Dependencies

- React, Framer Motion, lucide-react, Tailwind 4 via the Vite plugin.
- No Recharts dependency in current `package.json`; charting is local SVG/math.

## Notable Patterns / Gotchas

- Use `--color-cta` for primary CTA backgrounds; avoid hard-coded `bg-white`, `text-black`, and hex borders outside intentional exceptions.
- Motion literals should go through `src/lib/motion.ts`.
- Verify important UI in light, dark, desktop, and sub-640px mobile.
- Text in compact controls must not wrap accidentally.
- Cards should be decision units, not decorative wrappers.
