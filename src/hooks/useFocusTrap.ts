import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus containment for modal surfaces: initial focus on open, focus restore
 * on close, Escape-to-close, and a Tab / Shift+Tab cycle that pulls escaped
 * focus back to the panel edges. Extracted from the shared Dialog primitive
 * so hand-rolled sheets (LightAddExpenseDialog, UniversalCaptureDialog,
 * VoiceDialog) trap keyboard focus the same way (QA 2026-06-24 a11y finding).
 *
 * Attach the ref to the `role="dialog"` element; give it `tabIndex={-1}` so
 * the panel itself can take initial focus when nothing inside is focusable.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) {
  // Element that had focus before the dialog opened — restored on close so
  // keyboard users land back on the trigger instead of <body>.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Initial focus on open + focus restore on close. React's own `autoFocus`
  // fires on mount, before the rAF — if focus already sits inside the panel
  // we leave it alone.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.contains(active)) return;
      const target = panel.querySelector<HTMLElement>("[autofocus]");
      (target ?? panel).focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      restoreFocusRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    };
  }, [open, panelRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: Tab / Shift+Tab cycle within the panel; focus that
      // escaped (or never entered) is pulled back to the edges.
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.matches(":disabled") && el.getClientRects().length > 0);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && panel.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first || active === panel) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, panelRef]);
}
