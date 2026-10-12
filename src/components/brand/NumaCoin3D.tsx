import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type NumaCoin3DMode = "spin" | "float" | "flip" | "idle";

interface NumaCoin3DProps {
  /** Coin diameter in px. */
  size?: number;
  /** spin = continuous 360°; float = gentle 3D tilt + bob; flip = one reveal; idle = static tilt. */
  mode?: NumaCoin3DMode;
  /** Ridged-edge segment count. Lower it for tiny coins to keep the DOM light. */
  segments?: number;
  className?: string;
}

/** The Numa "n" mark — engraved into the coin face, with the lime bead. */
function NMark() {
  return (
    <svg className="nm-coin3d-mark" viewBox="0 0 100 100" aria-hidden focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M33 74 V49" />
        <path d="M33 51 C33 38 67 38 67 51 V74" />
      </g>
      <circle className="nm-coin3d-mark-bead" cx={50} cy={66} r={7.5} />
    </svg>
  );
}

/** The reverse — concentric engraved rings (matches the coin-sheet "back"). */
function BackRings() {
  return (
    <svg className="nm-coin3d-mark nm-coin3d-mark--rings" viewBox="0 0 100 100" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={6}>
        <circle cx={50} cy={50} r={30} />
        <circle cx={50} cy={50} r={20} strokeWidth={5} />
        <circle cx={50} cy={50} r={10} strokeWidth={4} />
      </g>
    </svg>
  );
}

/**
 * A real CSS-3D Numa coin: two metallic faces (the "n" mark + the reverse
 * rings) joined by a ridged edge built from radial segments, all in a
 * `preserve-3d` group so it genuinely rotates through depth — not a flat
 * disc faking a tilt. Fully tokenised (`--color-coin-*`) so it tracks the
 * active palette + dark mode. Reuse it as the welcome hero, loaders, and
 * reward moments via the `mode` prop.
 */
export function NumaCoin3D({
  size = 160,
  mode = "spin",
  segments = 50,
  className
}: NumaCoin3DProps) {
  const radius = size / 2;
  const thickness = Math.max(7, Math.round(size * 0.07));
  const arc = (Math.PI * size) / segments + 1; // +1px overlap kills seams
  return (
    <span
      aria-hidden
      className={cn("nm-coin3d", `nm-coin3d--${mode}`, className)}
      style={
        {
          "--coin-size": `${size}px`,
          "--coin-thick": `${thickness}px`
        } as CSSProperties
      }
    >
      <span className="nm-coin3d-shadow" />
      <span className="nm-coin3d-rotor">
        <span className="nm-coin3d-face nm-coin3d-face--front">
          <NMark />
        </span>
        <span className="nm-coin3d-face nm-coin3d-face--back">
          <BackRings />
        </span>
        <span className="nm-coin3d-edge" aria-hidden>
          {Array.from({ length: segments }).map((_, i) => (
            <span
              key={i}
              className="nm-coin3d-edge-seg"
              style={
                {
                  width: `${arc}px`,
                  height: `${thickness}px`,
                  transform: `translate(-50%, -50%) rotateZ(${(360 / segments) * i}deg) translateY(${radius}px) rotateX(90deg)`
                } as CSSProperties
              }
            />
          ))}
        </span>
      </span>
    </span>
  );
}
