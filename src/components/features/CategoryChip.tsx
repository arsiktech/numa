import { CategoryIcon, tonesFor } from "@/components/features/CategoryIcon";
import { cn } from "@/lib/cn";
import type { Category } from "@/lib/types";

interface CategoryChipProps {
  category: Category;
  active: boolean;
  onClick: () => void;
  /** "sm" is the compact dialog variant; "md" the desktop panel variant. */
  size?: "sm" | "md";
}

/**
 * The category pill used by the light add-expense dialog and the desktop
 * add-money panel. Both previously carried their own near-identical copy
 * (differing only in height/padding/icon size, preserved here via `size`).
 */
export function CategoryChip({ category, active, onClick, size = "md" }: CategoryChipProps) {
  const tone = tonesFor(category.color);
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-xl border font-semibold",
        sm
          ? "h-9 shrink-0 gap-1.5 px-3 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
          : "h-10 gap-2 px-3.5 text-[13.5px]",
        active
          ? "border-[color:var(--color-cta-ink)] bg-[color:var(--color-cta-ink)] text-[color:var(--color-ink)]"
          : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)]"
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-md text-[13px]",
          sm ? "h-[18px] w-[18px]" : "h-[19px] w-[19px]"
        )}
        style={active ? undefined : { background: tone.surface, color: tone.ink }}
        aria-hidden
      >
        {category.emoji ? (
          <span className="nm-emoji leading-none">{category.emoji}</span>
        ) : (
          <CategoryIcon name={category.icon} size={12} />
        )}
      </span>
      {category.name}
    </button>
  );
}
