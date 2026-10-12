import { useEffect, useState } from "react";

/**
 * How many CSS pixels of the layout viewport the on-screen keyboard covers.
 *
 * iOS Safari (and standalone PWAs) never resize the layout viewport for the
 * keyboard — `100dvh` stays full-height and `position: fixed` bottoms sink
 * behind the keys. The only truthful signal is visualViewport: the covered
 * strip is what's left of the layout height after the visual viewport's
 * height and its pan offset. Android Chrome resizes the layout viewport
 * instead, so this computes ≈0 there — which is exactly right, the CSS
 * already fit.
 */
export function keyboardInsetFrom(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number
): number {
  if (
    !Number.isFinite(innerHeight) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(viewportOffsetTop)
  ) {
    return 0;
  }
  const inset = Math.round(innerHeight - viewportHeight - viewportOffsetTop);
  // Browser chrome shows/hides shave off a few dozen px too — only a gap the
  // size of an actual keyboard counts.
  return inset > 80 ? inset : 0;
}

function editableFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

/**
 * Live keyboard occlusion in px — 0 on desktop, 0 while no text field is
 * focused (so pinch-zoom never masquerades as a keyboard), and 0 on browsers
 * that already resize the layout viewport. Subscribe only where the layout
 * has to duck (the /numa composer); everything else can stay ignorant.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setInset(
          editableFocused()
            ? keyboardInsetFrom(window.innerHeight, viewport.height, viewport.offsetTop)
            : 0
        );
      });
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    return () => {
      window.cancelAnimationFrame(raf);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, []);

  return inset;
}
