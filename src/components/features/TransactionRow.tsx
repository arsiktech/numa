import { useState } from "react";
import { format } from "date-fns";
import { MapPin } from "lucide-react";
import { CategoryIcon, tonesFor } from "./CategoryIcon";
import { Avatar } from "@/components/ui/Avatar";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCategories, useMemberships } from "@/services/store";
import type { Transaction } from "@/lib/types";

interface Props {
  transaction: Transaction;
  showPortfolio?: string;
  compact?: boolean;
  onClick?: () => void;
  /** Fired when a category chip is dropped on this row (DnD), or when this row
   *  is tapped while a category is "picked" (touch fallback handled by parent). */
  onCategoryDrop?: (categoryId: string) => void;
}

export function TransactionRow({
  transaction,
  showPortfolio,
  compact,
  onClick,
  onCategoryDrop
}: Props) {
  const categories = useCategories(transaction.portfolioId);
  const members = useMemberships(transaction.portfolioId);
  const category = categories.find((c) => c.id === transaction.categoryId);
  const member = members.find((m) => m.userId === transaction.createdByUserId);
  const tone = category ? tonesFor(category.color) : tonesFor("lavender");
  const isIncome = transaction.kind === "income";
  const amountSign = isIncome ? "+" : "−";
  const [dragOver, setDragOver] = useState(false);
  const Tag = onClick ? "button" : "div";

  const dropEnabled = typeof onCategoryDrop === "function";

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    if (!dropEnabled) return;
    // Only accept the drag if it carries our payload (or text/plain fallback).
    const types = event.dataTransfer.types;
    if (
      types.length === 0 ||
      types.includes("application/numa-category") ||
      types.includes("text/plain")
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!dragOver) setDragOver(true);
    }
  }

  function handleDragLeave() {
    if (!dropEnabled) return;
    setDragOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    if (!dropEnabled || !onCategoryDrop) return;
    event.preventDefault();
    setDragOver(false);
    const categoryId =
      event.dataTransfer.getData("application/numa-category") ||
      event.dataTransfer.getData("text/plain");
    if (!categoryId) return;
    onCategoryDrop(categoryId);
  }

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      {...(dropEnabled
        ? {
            onDragOver: handleDragOver,
            onDragEnter: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop
          }
        : {})}
      aria-dropeffect={dropEnabled ? "copy" : undefined}
      className={cn(
        "w-full text-left flex items-center gap-3 px-4 rounded-xl hover:bg-[color:var(--color-cream-50)] transition-colors group",
        onClick ? "cursor-pointer focus-visible:bg-[color:var(--color-cream-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]" : "",
        compact ? "py-2" : "py-3",
        dragOver
          ? "ring-2 ring-[color:var(--color-brand)]/40 bg-[color:var(--color-brand-mist)]/40"
          : ""
      )}
    >
      <div className="w-12 shrink-0">
        <p className="text-[11px] text-[color:var(--color-ink-3)] font-medium">
          {format(transaction.occurredAt, "d MMM")}
        </p>
        <p className="text-[10px] text-[color:var(--color-ink-4)]">
          {format(transaction.occurredAt, "HH:mm")}
        </p>
      </div>
      <span
        className="grid place-items-center w-9 h-9 rounded-xl shrink-0"
        style={{ background: tone.surface, color: tone.ink }}
      >
        <CategoryIcon name={category?.icon ?? "sparkles"} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] tracking-[-0.005em] truncate">
          {transaction.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {category ? (
            <span
              className="nm-pill border text-[11px]"
              style={{
                background: tone.surface,
                color: tone.ink,
                borderColor: "var(--color-line)"
              }}
            >
              {category.name}
            </span>
          ) : null}
          {showPortfolio ? (
            <span className="text-[11px] text-[color:var(--color-ink-4)]">{showPortfolio}</span>
          ) : null}
          {member ? (
            <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-ink-4)]">
              <Avatar name={member.displayName} size={16} />
              {member.displayName}
            </span>
          ) : null}
          {transaction.location ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-[color:var(--color-ink-4)] max-w-[140px]"
              title={
                transaction.location.label ??
                `${transaction.location.lat.toFixed(4)}, ${transaction.location.lng.toFixed(4)}`
              }
            >
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">
                {transaction.location.label ??
                  `${transaction.location.lat.toFixed(2)}, ${transaction.location.lng.toFixed(2)}`}
              </span>
            </span>
          ) : null}
        </div>
      </div>
      <p
        className={cn(
          "text-[14px] font-semibold nm-num tabular-nums tracking-[-0.005em]",
          isIncome ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-ink)]"
        )}
      >
        {amountSign}
        {formatMoney(transaction.amount, transaction.currency)}
      </p>
    </Tag>
  );
}
