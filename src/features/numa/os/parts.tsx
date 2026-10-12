import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ChevronLeft, ChevronRight, LayoutGrid, X } from "lucide-react";
import { NumaCoinLogo } from "@/components/brand/NumaCoinLogo";
import { AnimatedAmount } from "@/components/ui/AnimatedAmount";
import { Sparkle } from "@/components/ui/Sparkle";
import { cn } from "@/lib/cn";
import { formatMoneyDecimal } from "@/lib/money";
import type { Transaction } from "@/lib/types";
import {
  draftSubtitle,
  draftTitle,
  type ChatMessage,
  type LocalActionDraft
} from "../engine";
import {
  dayTitle,
  groupByDay,
  isToday,
  monthTitle
} from "../threads";
import { MerchantStillLife, stillLifeKindFor } from "../stillLife";
import { MerchantVisual } from "../MerchantVisual";
/** One spring for every shared-element morph — a single body language. */
export const MORPH_SPRING = { type: "spring" as const, stiffness: 380, damping: 36, mass: 0.9 };
export const PAGE_SPRING = { type: "spring" as const, stiffness: 320, damping: 33, mass: 0.95 };

import { merchantImageKey } from "../useMerchantImages";

export function ThreadHeader({
  day,
  locale,
  onPrev,
  onNext,
  nextDisabled,
  onCatalog
}: {
  day: string;
  locale: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  onCatalog: () => void;
}) {
  return (
    <header className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--color-paper)] shadow-[var(--shadow-sm)]">
          <NumaCoinLogo size={30} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            {monthTitle(day, locale)}
          </p>
          <h1
            className="truncate text-[24px] font-bold leading-none tracking-[-0.02em] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {dayTitle(day, locale)}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <PagerButton label="Previous day" onClick={onPrev}>
          <ChevronLeft size={16} />
        </PagerButton>
        <PagerButton label="Next day" onClick={onNext} disabled={nextDisabled}>
          <ChevronRight size={16} />
        </PagerButton>
        <button
          type="button"
          onClick={onCatalog}
          aria-label="See all days"
          className="ml-1 inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--color-ink)] px-3.5 text-[12.5px] font-bold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)] transition-transform active:scale-[0.96]"
        >
          <LayoutGrid size={14} />
          <span className="hidden sm:inline">All days</span>
        </button>
      </div>
    </header>
  );
}

export function PagerButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] transition-transform active:scale-[0.96] disabled:opacity-35 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

/** The swipeable page body — real drag with spring release. */
export function ThreadPage({
  direction,
  reducedMotion,
  onSwipePrev,
  onSwipeNext,
  children
}: {
  direction: number;
  reducedMotion: boolean;
  onSwipePrev: () => void;
  onSwipeNext: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col rounded-[26px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-md)] sm:p-5"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * 56 }}
      animate={{ opacity: 1, x: 0 }}
      transition={PAGE_SPRING}
      drag={reducedMotion ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.16}
      onDragEnd={(_, info) => {
        const power = info.offset.x + info.velocity.x * 0.2;
        if (power < -90) onSwipeNext();
        else if (power > 90) onSwipePrev();
      }}
    >
      {children}
    </motion.div>
  );
}

export function DayHero({
  day,
  locale,
  spent,
  currency,
  brief
}: {
  day: string;
  locale: string;
  spent: number;
  currency: Transaction["currency"];
  brief: string;
}) {
  const ru = locale.startsWith("ru");
  const es = locale.startsWith("es");
  const label = isToday(day)
    ? ru
      ? "потрачено сегодня"
      : es
        ? "gastado hoy"
        : "spent today"
    : ru
      ? "потрачено"
      : es
        ? "gastado"
        : "spent";
  return (
    <div className="px-1 pt-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
        {label}
      </p>
      <p
        className="mt-1 text-[clamp(34px,9vw,46px)] font-semibold leading-[0.95] tracking-[-0.045em] tabular-nums text-[color:var(--color-ink)] nm-num"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <AnimatedAmount value={spent} currency={currency} formatter={formatMoneyDecimal} duration={620} />
      </p>
      <p className="mt-2 max-w-[520px] text-[13px] leading-relaxed text-[color:var(--color-ink-3)]">
        {brief}
      </p>
    </div>
  );
}

export function EntriesRow({
  entries,
  categoryNameById,
  imageUrls,
  onZoomOut
}: {
  entries: Transaction[];
  categoryNameById: Map<string, string>;
  imageUrls: Map<string, string>;
  onZoomOut: () => void;
}) {
  return (
    <div className="-mx-1 mt-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1.5">
      {entries.map((tx) => (
        <EntryCard
          key={tx.id}
          tx={tx}
          categoryName={tx.categoryId ? categoryNameById.get(tx.categoryId) : undefined}
          imageUrls={imageUrls}
          onClick={onZoomOut}
        />
      ))}
    </div>
  );
}

export function EntryCard({
  tx,
  categoryName,
  imageUrls,
  onClick
}: {
  tx: Transaction;
  categoryName?: string;
  imageUrls: Map<string, string>;
  onClick: () => void;
}) {
  const kind = stillLifeKindFor(tx, categoryName);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="w-[120px] shrink-0 snap-start rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-bg)] p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
    >
      <motion.div layoutId={`nm-vis-${tx.id}`} transition={MORPH_SPRING} className="mx-auto h-[76px] w-[76px]">
        <MerchantVisual
          kind={kind}
          merchant={tx.description}
          imageUrl={imageUrls.get(merchantImageKey(tx.description, kind))}
          className="h-full w-full"
        />
      </motion.div>
      <p className="mt-1.5 truncate text-[11.5px] font-semibold text-[color:var(--color-ink)]">
        {tx.description}
      </p>
      <p className="font-mono text-[10.5px] tabular-nums text-[color:var(--color-ink-3)]">
        {tx.kind === "income" ? "+" : "−"}
        {formatMoneyDecimal(tx.amount, tx.currency)}
      </p>
    </motion.button>
  );
}

/**
 * The empty-day moment: a ghost of the brand object and three quick-capture
 * chips that prefill the composer — the void becomes the invitation.
 */
export function QuietDay({ onPick }: { onPick: (text: string) => void }) {
  const suggestions = ["coffee 3.50", "groceries 24", "lunch 12.90"];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0 }}
      className="m-auto flex max-w-[320px] flex-col items-center py-6 text-center"
    >
      <div className="h-[96px] w-[96px] opacity-70">
        <MerchantStillLife kind="spark" seedKey="quiet-day" className="h-full w-full" />
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[color:var(--color-ink-3)]">
        The day is a blank shelf. Put something on it.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="h-9 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3.5 font-mono text-[12px] tabular-nums text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] transition-transform active:scale-[0.96] hover:border-[color:var(--color-line-strong)]"
          >
            {text}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

export function Bubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  // Ink-develop streaming: the freshest chunk fades up while everything
  // already written stays put — words arrive, they don't blink.
  const prevLenRef = useRef(0);
  const content = message.content;
  useEffect(() => {
    prevLenRef.current = streaming ? content.length : 0;
  }, [content, streaming]);
  const settled = streaming ? content.slice(0, Math.min(prevLenRef.current, content.length)) : content;
  const fresh = streaming ? content.slice(settled.length) : "";
  return (
    <motion.div
      // Transform + opacity only (a stray inline `filter` from an interrupted
      // spring froze 17 bubbles in real-browser QA). `initial` is evaluated
      // once per element by framer, so re-renders mid-flight can't cancel the
      // entrance and strand a half-faded bubble.
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", duration: 0.36, bounce: 0 }}
      className={cn(
        "max-w-[86%] rounded-[20px] px-4 py-2.5 text-[13.5px] leading-relaxed",
        isUser
          ? "ml-auto rounded-br-md bg-[color:var(--color-ink)] text-[color:var(--color-bg)]"
          : "rounded-bl-md bg-[color:var(--color-bg)] text-[color:var(--color-ink-2)]"
      )}
    >
      {settled}
      {fresh ? (
        <span key={content.length} className="nm-chunk-in">
          {fresh}
        </span>
      ) : null}
      {streaming ? <StreamCaret /> : null}
    </motion.div>
  );
}

export function StreamCaret() {
  return (
    <span className="nm-stream-caret ml-1 inline-block h-[1em] w-[3px] translate-y-[2px] rounded-full bg-[color:var(--color-coin-lime)]" />
  );
}

/** Numa is thinking — three lime dots breathing in canon. */
export function ThinkingDots() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-[20px] rounded-bl-md bg-[color:var(--color-bg)] px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-[7px] w-[7px] rounded-full bg-[color:var(--color-coin-lime)]"
          animate={{ scale: [1, 1.5, 1], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function DraftCard({
  draft,
  onConfirm,
  onCancel
}: {
  draft: LocalActionDraft;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const settled = draft.status !== "draft" && draft.status !== "executing";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
      className="max-w-[86%] rounded-[20px] rounded-bl-md bg-[color:var(--color-brand-mist)] p-4"
    >
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
        <Sparkle size={11} />
        propose
      </p>
      <p className="mt-1.5 text-[15px] font-bold leading-tight text-[color:var(--color-ink)]">
        {draftTitle(draft)}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-ink-3)]">
        {draftSubtitle(draft)}
      </p>
      {draft.status === "executing" ? (
        <p className="mt-2.5 text-[12px] font-semibold text-[color:var(--color-ink-3)]">
          Saving…
        </p>
      ) : settled ? (
        <p className="mt-2.5 text-[12px] font-semibold text-[color:var(--color-ink-3)]">
          {draft.status === "confirmed"
            ? "Done."
            : draft.status === "queued"
              ? "Queued for sync."
            : draft.status === "cancelled"
              ? "Skipped."
              : "Didn't go through."}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-[color:var(--color-ink)] px-4 text-[12.5px] font-bold text-[color:var(--color-cta-ink)] transition-transform active:scale-[0.96]"
          >
            Yes, do it
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Skip this draft"
            className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] transition-transform active:scale-[0.96]"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  busy
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
      className="mt-2 flex items-center gap-2 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-bg)] py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-[color:var(--color-brand-soft)]"
    >
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Say “coffee 3.50” or ask anything"
        aria-label="Message Numa Pro"
        className="min-w-0 flex-1 bg-transparent text-[16px] sm:text-[13.5px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={busy || value.trim().length === 0}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-cta-ink)] transition-transform active:scale-[0.94] disabled:opacity-40"
      >
        <ArrowUp size={16} strokeWidth={2.6} />
      </button>
    </form>
  );
}

/* ======================================================================= */
/* Catalog view                                                            */
/* ======================================================================= */

export function CatalogView({
  dayGroups,
  locale,
  currency,
  categoryNameById,
  imageUrls,
  formatAmount,
  onOpenDay,
  onClose
}: {
  dayGroups: Map<string, ReturnType<typeof groupByDay> extends Map<string, infer V> ? V : never>;
  locale: string;
  currency: Transaction["currency"];
  categoryNameById: Map<string, string>;
  imageUrls: Map<string, string>;
  formatAmount: (amount: number, currency: Transaction["currency"]) => string;
  onOpenDay: (day: string) => void;
  onClose: () => void;
}) {
  const days = useMemo(
    () => [...dayGroups.keys()].sort((a, b) => (a < b ? 1 : -1)),
    [dayGroups]
  );
  // Month separators, newest first.
  const sections = useMemo(() => {
    const byMonth = new Map<string, string[]>();
    for (const day of days) {
      const month = day.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), day]);
    }
    return [...byMonth.entries()];
  }, [days]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            every entry
          </p>
          <h1
            className="mt-1 text-[24px] font-bold leading-none tracking-[-0.02em] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            All days
          </h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to today"
          className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] transition-transform active:scale-[0.96]"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        {sections.length === 0 ? (
          <div className="rounded-[24px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-6 py-14 text-center">
            <div className="mx-auto h-[88px] w-[88px]">
              <MerchantStillLife kind="spark" seedKey="empty" className="h-full w-full" />
            </div>
            <p className="mt-4 text-[15px] font-semibold text-[color:var(--color-ink)]">
              Your money, in pictures.
            </p>
            <p className="mx-auto mt-1 max-w-[340px] text-[13px] leading-relaxed text-[color:var(--color-ink-3)]">
              Every entry becomes a little studio shot here. Add the first one and watch the shelf fill.
            </p>
          </div>
        ) : (
          sections.map(([month, monthDays]) => (
            <section key={month} className="mb-7">
              <h2
                className="px-1 text-[19px] font-bold tracking-[-0.02em] text-[color:var(--color-ink)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {monthTitle(`${month}-01`, locale)}
              </h2>
              {monthDays.map((day) => {
                const group = dayGroups.get(day)!;
                return (
                  <div key={day} className="mt-4">
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className="flex w-full items-baseline justify-between gap-3 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
                    >
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
                        {dayTitle(day, locale)}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-[color:var(--color-ink-2)]">
                        {formatAmount(group.spent, currency)}
                      </span>
                    </button>
                    <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                      {group.entries.map((tx) => (
                        <CatalogTile
                          key={tx.id}
                          tx={tx}
                          categoryName={tx.categoryId ? categoryNameById.get(tx.categoryId) : undefined}
                          imageUrls={imageUrls}
                          onClick={() => onOpenDay(day)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export function CatalogTile({
  tx,
  categoryName,
  imageUrls,
  onClick
}: {
  tx: Transaction;
  categoryName?: string;
  imageUrls: Map<string, string>;
  onClick: () => void;
}) {
  const kind = stillLifeKindFor(tx, categoryName);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="group rounded-[20px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-3 text-left shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
    >
      <motion.div
        layoutId={`nm-vis-${tx.id}`}
        transition={MORPH_SPRING}
        className="mx-auto aspect-square w-full max-w-[132px]"
      >
        <MerchantVisual
          kind={kind}
          merchant={tx.description}
          imageUrl={imageUrls.get(merchantImageKey(tx.description, kind))}
          className="h-full w-full"
        />
      </motion.div>
      <p className="mt-1 truncate text-[12px] font-semibold text-[color:var(--color-ink)]">
        {tx.description}
      </p>
      <p className="font-mono text-[11px] tabular-nums text-[color:var(--color-ink-3)]">
        {tx.kind === "income" ? "+" : "−"}
        {formatMoneyDecimal(tx.amount, tx.currency)}
      </p>
    </motion.button>
  );
}
