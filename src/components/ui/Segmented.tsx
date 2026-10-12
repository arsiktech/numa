import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { SPRING_PILL } from "@/lib/motion";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className
}: SegmentedProps<T>) {
  const layoutId = useId();
  const sizeClass = size === "sm" ? "p-[3px] text-[12px]" : "p-1 text-[13px]";
  const btnPadding = size === "sm" ? "px-3 py-1" : "px-3.5 py-1.5";
  return (
    <div
      role="group"
      className={cn(
        "inline-flex items-center rounded-full border border-[color:var(--color-line-glass)] bg-[color:var(--color-glass)] backdrop-blur-xl max-w-full overflow-x-auto shadow-[var(--shadow-sm)]",
        sizeClass,
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full font-medium tracking-[-0.005em] transition-colors whitespace-nowrap",
              btnPadding,
              active
                ? "text-[color:var(--color-ink)]"
                : "text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink-2)]"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-[color:var(--color-paper)] shadow-[var(--shadow-md)] border border-[color:var(--color-line-glass)]"
                transition={SPRING_PILL}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
