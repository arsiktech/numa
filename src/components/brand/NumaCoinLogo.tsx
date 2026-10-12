import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * The Numa coin logo — the canonical brand mark, using the photorealistic
 * 3D coin render (isolated onto transparency, with its soft contact shadow).
 * `variant="front"` is the symmetric face (crisper at tiny sizes / favicons);
 * the default 3/4 "tilt" shows the coin's depth. `float` gives the hero coin a
 * gentle bob. Decorative — always pair with a real text label.
 */
export function NumaCoinLogo({
  size = 40,
  variant = "tilt",
  float = false,
  className
}: {
  size?: number;
  variant?: "tilt" | "front";
  float?: boolean;
  className?: string;
}) {
  const src = variant === "front" ? "/numa-coin-front.png" : "/numa-coin.png";
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={cn("nm-coin-logo", float && "nm-coin-logo--float", className)}
      style={{ width: size, height: size } as CSSProperties}
    />
  );
}
