import { useEffect } from "react";
import { createPortal } from "react-dom";
import { NumaCoin3D } from "@/components/brand/NumaCoin3D";

/**
 * A brief, tasteful brand flourish for positive money milestones — a flipping
 * Numa coin over a lime burst + sparkle ring, auto-dismissing after ~1.4s.
 * Portalled to <body> so it floats above any dialog. Decorative + pointer-
 * transparent; reduced-motion users get a soft static fade (handled in CSS).
 * Trigger it from the parent on a meaningful win (goal funded, money added).
 */
export function CoinCelebration({
  show,
  onDone,
  label
}: {
  show: boolean;
  onDone: () => void;
  label?: string;
}) {
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(onDone, 1450);
    return () => window.clearTimeout(id);
  }, [show, onDone]);

  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div className="nm-coin-celebrate" aria-hidden>
      <span className="nm-coin-celebrate-burst" />
      <span className="nm-coin-celebrate-ring" />
      <span className="nm-coin-celebrate-coin">
        <NumaCoin3D size={132} mode="flip" />
      </span>
      {label ? <span className="nm-coin-celebrate-label">{label}</span> : null}
    </div>,
    document.body
  );
}
