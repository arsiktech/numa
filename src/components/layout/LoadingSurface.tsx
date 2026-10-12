import { NumaCoin3D } from "@/components/brand/NumaCoin3D";
import { cn } from "@/lib/cn";

interface LoadingSurfaceProps {
  compact?: boolean;
  className?: string;
  label?: string;
}

export function LoadingSurface({
  compact = false,
  className,
  label = "Loading Numa Pro"
}: LoadingSurfaceProps) {
  return (
    <div
      className={cn("nm-loading-shell", compact ? "min-h-[260px]" : "min-h-screen", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="flex w-full max-w-[300px] items-center gap-3 rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-sm)]"
        aria-hidden="true"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--color-cream-100)]">
          <NumaCoin3D size={32} mode="spin" segments={32} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-2.5 w-24 rounded-full nm-shimmer" />
          <div className="h-2 w-full rounded-full nm-shimmer" />
        </div>
      </div>
    </div>
  );
}
