import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Sparkle } from "@/components/ui/Sparkle";
import { emitCommand } from "@/lib/commands";
import { cn } from "@/lib/cn";

/**
 * The desktop search affordance (⌘K) used in every advanced surface header.
 * Emits the same `open-search` command regardless of the route it sits on;
 * previously pasted into Goals, Insights, Advanced Home and Wealth.
 */
export function SearchCommandButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => emitCommand("open-search")}
      className={cn(
        "nm-interactive inline-flex h-11 w-[210px] items-center gap-2 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3.5 text-left text-[13px] text-[color:var(--color-ink-3)] shadow-[var(--shadow-sm)]",
        className
      )}
    >
      <Search size={14} />
      <span className="min-w-0 flex-1">Search</span>
      <kbd className="rounded-md bg-[color:var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-ink-3)]">
        ⌘K
      </kbd>
    </button>
  );
}

/** The brand-tinted companion button that opens Numa with a prompt. */
export function AskNumaButton({
  prompt,
  label = "Ask Numa Pro",
  icon
}: {
  prompt?: string;
  label?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => (prompt ? emitCommand("ask-numa", { prompt }) : emitCommand("ask-numa"))}
      className="nm-interactive inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--color-brand-mist)] px-4 text-[13px] font-semibold text-[color:var(--color-ink)]"
    >
      {icon ?? <Sparkle size={14} />}
      {label}
    </button>
  );
}

/** Plain-page search: text and a shortcut hint, no card chrome. Desktop only;
 * on phones the floating add cluster carries Search. */
export function PlainSearchButton() {
  return (
    <button type="button" onClick={() => emitCommand("open-search")} className="nm-plain-search" aria-label="Search">
      <Search size={16} aria-hidden />
      <span>Search</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
