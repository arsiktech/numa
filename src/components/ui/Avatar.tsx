import { useEffect, useState } from "react";
import { initialsFor } from "@/lib/ids";
import { cn } from "@/lib/cn";

const tones = [
  "bg-[color:var(--color-lavender-200)] text-[color:var(--color-brand-strong)]",
  "bg-[color:var(--color-mint-200)] text-[color:var(--color-positive)]",
  "bg-[color:var(--color-peach-200)] text-[color:var(--color-amber-ink)]",
  "bg-[color:var(--color-blush-200)] text-[color:var(--color-negative)]",
  "bg-[color:var(--color-sky-200)] text-[color:var(--color-info)]",
  "bg-[color:var(--color-sand-200)] text-[color:var(--color-olive-ink)]"
];

function toneFor(seed: string) {
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) total = (total + seed.charCodeAt(i)) % tones.length;
  return tones[total]!;
}

export function Avatar({
  name,
  url,
  src,
  size = 32,
  className
}: {
  name: string;
  /** @deprecated use `src` instead */
  url?: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  const imageSrc = (src ?? url ?? "").trim();
  const [failed, setFailed] = useState(false);

  // Reset error state when src changes so a new avatar can be tried.
  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

  if (imageSrc && !failed) {
    return (
      <img
        src={imageSrc}
        alt={name}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full font-semibold tracking-[-0.01em]",
        toneFor(name),
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initialsFor(name)}
    </span>
  );
}
