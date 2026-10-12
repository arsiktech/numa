import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Apple, CalendarDays, Delete, Mic, ScanLine, X } from "lucide-react";
import { CategoryChip } from "@/components/features/CategoryChip";
import { DialogLoadingFallback } from "@/components/layout/DialogLoadingFallback";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cn } from "@/lib/cn";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { currencySymbol, formatMoneyDecimal } from "@/lib/money";
import { useDomainActions } from "@/services/domainActions";
import { makeClientMutationId } from "@/services/writeQueue";
import {
  useCategories,
  useCurrentPortfolioId,
  useCurrentUser,
  usePortfolio
} from "@/services/store";
import type { Category, CurrencyCode } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ScanDialog = lazy(() => import("./ScanDialog").then(module => ({ default: module.ScanDialog })));
const VoiceDialog = lazy(() => import("./VoiceDialog").then(module => ({ default: module.VoiceDialog })));

const KEY_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "delete"] as const;
const QUICK_EXPENSE_PRESETS = [
  { label: "Coffee", amount: 4.5, category: /coffee|cafe|food|dining/i },
  { label: "Lunch", amount: 12, category: /food|dining|restaurant|lunch/i },
  { label: "Groceries", amount: 40, category: /grocery|groceries|food|shopping/i },
  { label: "Ride", amount: 8, category: /transport|taxi|ride|uber|travel/i }
] as const;

export function LightAddExpenseDialog({ open, onClose }: Props) {
  return open ? <LightEntry onClose={onClose} /> : null;
}

function LightEntry({ onClose }: Pick<Props, "onClose">) {
  const [currentPortfolioId] = useCurrentPortfolioId();
  const [portfolioId] = useState(currentPortfolioId);
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const [draftUserId] = useState(me.id);
  const categories = useCategories(portfolio.id);
  const actions = useDomainActions();
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.kind === "expense"),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((category) => category.kind === "income"),
    [categories]
  );
  // Income capture is the Simple-mode path that lets buckets fill through
  // normal use — the sheet is a toggle between the two kinds, not two sheets.
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const activeCategories = kind === "income" ? incomeCategories : expenseCategories;
  const defaultCategoryId = useMemo(
    () =>
      kind === "income"
        ? incomeCategories.find((category) => /salary|income/i.test(category.name))?.id ??
          incomeCategories[0]?.id ??
          ""
        : expenseCategories.find((category) => /coffee/i.test(category.name))?.id ??
          expenseCategories[0]?.id ??
          "",
    [kind, incomeCategories, expenseCategories]
  );
  const [amount, setAmount] = useState("0");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [occurredAtIso, setOccurredAtIso] = useState(() => toIsoDate(new Date()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [locked, setLocked] = useState(false);
  const [queued, setQueued] = useState(false);
  const savingRef = useRef(false);
  // A retry is the same financial intent, including its original timestamp.
  const submission = useRef<{
    input: Parameters<typeof actions.createTransaction>[0];
    clientMutationId: string;
  } | null>(null);
  const contextChanged = currentPortfolioId !== portfolioId || me.id !== draftUserId;
  const close = () => { if (!savingRef.current) onClose(); };
  const panelRef = useRef<HTMLElement | null>(null);
  useBodyScrollLock(true);
  useFocusTrap(panelRef, !showScan && !showVoice, close);

  // A category refresh cannot change an already submitted intent.
  useEffect(() => {
    if (!locked) setCategoryId(defaultCategoryId);
  }, [defaultCategoryId, locked]);

  const selectedCategory =
    activeCategories.find((category) => category.id === categoryId) ??
    activeCategories[0];
  const numericAmount = Number(amount);
  const canSave = !contextChanged && !queued && !busy && (locked || (Number.isFinite(numericAmount) && numericAmount > 0));
  const currency = portfolio.defaultCurrency;
  const amountDisplay = normalizeDisplayAmount(amount);
  const buttonAmount = formatMoneyDecimal(Math.max(0, numericAmount || 0), currency);
  const selectedName = selectedCategory?.name ?? (kind === "income" ? "Income" : "Expense");
  const isIncome = kind === "income";

  function appendKey(key: (typeof KEY_VALUES)[number]) {
    setMessage(null);
    setAmount((current) => nextAmountValue(current, key));
  }

  function applyQuickPreset(preset: (typeof QUICK_EXPENSE_PRESETS)[number]) {
    setMessage(null);
    setAmount(formatPresetAmount(preset.amount));
    setNote(preset.label);
    const presetCategory = expenseCategories.find((category) => preset.category.test(category.name));
    if (presetCategory) setCategoryId(presetCategory.id);
  }

  async function save() {
    if (savingRef.current || !canSave) return;
    if (!submission.current) {
      submission.current = {
        input: {
          portfolioId,
          occurredAt: occurredAtForIso(occurredAtIso),
          description: note.trim() || selectedName,
          categoryId: selectedCategory?.id,
          kind,
          amount: numericAmount,
          currency,
          createdByUserId: draftUserId
        },
        clientMutationId: makeClientMutationId("transactions.add")
      };
    }
    const intent = submission.current;
    savingRef.current = true;
    setBusy(true);
    setLocked(true);
    setMessage(null);
    try {
      const result = await actions.createTransaction(intent.input, { clientMutationId: intent.clientMutationId });
      if (result.queued) setQueued(true);
      else onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save. Retry the same entry.");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[color:var(--color-scrim)] backdrop-blur-[2px]"
        onClick={close}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={queued ? "Waiting to sync" : isIncome ? "Add income" : "Add expense"}
        aria-busy={busy}
        className="fixed inset-x-0 bottom-0 z-[41] mx-auto flex max-h-[min(92dvh,720px)] w-full max-w-[430px] flex-col rounded-t-[24px] bg-[color:var(--color-bg)] px-[22px] pb-[max(env(safe-area-inset-bottom),24px)] pt-3 shadow-[0_-24px_58px_-18px_rgba(0,0,0,0.45)]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[color:var(--color-line-strong)]" />
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-[19px] font-bold tracking-[-0.025em] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {queued ? "Waiting to sync" : isIncome ? "Add income" : "Add expense"}
          </h2>
          <div className="flex items-center gap-2">
            {/* The transparent date input IS the click target — native picker
                opens from a direct click in every browser (never rely on
                showPicker() alone; it no-ops on clipped inputs in Safari). */}
            <div className="relative inline-flex rounded-full focus-within:ring-2 focus-within:ring-[color:var(--color-brand-soft)]">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[12px] font-semibold text-[color:var(--color-ink-2)]">
                <CalendarDays size={12} strokeWidth={2.2} aria-hidden />
                {friendlyDateLabel(occurredAtIso)}
              </span>
              <input
                type="date"
                disabled={locked || contextChanged}
                value={occurredAtIso}
                onChange={(e) => {
                  if (e.target.value) setOccurredAtIso(e.target.value);
                }}
                onClick={(e) => {
                  const el = e.currentTarget;
                  if (typeof el.showPicker !== "function") return;
                  try {
                    el.showPicker();
                  } catch {
                    // Native click/focus behavior still opens the picker.
                  }
                }}
                aria-label={isIncome ? "Income date" : "Expense date"}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close add expense"
              disabled={busy}
              className="grid h-8 w-8 place-items-center rounded-xl text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {contextChanged ? <p role="alert" className="mt-3 text-sm">Your account or space changed. Close and reopen this form to continue.</p> : null}
        {queued ? <p role="status" className="py-5 text-sm">Queued on this device. This entry is not confirmed in the cloud yet. Numa will retry when connected. You don’t need to add it again.</p> : null}
        {locked && !queued ? <p role="status" className="mt-3 text-sm">{formatMoneyDecimal(submission.current!.input.amount, submission.current!.input.currency)} · {submission.current!.input.description}. Your entry is kept for a safe retry.</p> : null}
        <fieldset disabled={locked || contextChanged} className={cn("min-w-0", queued && "hidden")}>
        <legend className="sr-only">Transaction details</legend>
        {/* Expense / Income kind toggle — the sheet is one surface for both
            directions so buckets can fill through normal daily use. */}
        <div
          role="tablist"
          aria-label="Entry kind"
          className="mt-3 grid grid-cols-2 gap-1 rounded-[14px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-1"
        >
          {(["expense", "income"] as const).map((option) => {
            const active = kind === option;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setMessage(null);
                  setKind(option);
                }}
                className={cn(
                  "h-10 rounded-[10px] text-[13px] font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
                  active
                    ? "bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
                    : "text-[color:var(--color-ink-3)]"
                )}
              >
                {option === "expense" ? "Expense" : "Income"}
              </button>
            );
          })}
        </div>
        <div className="py-5 text-center">
          <div className="inline-flex items-baseline gap-1">
            <span
              className="text-[30px] font-bold tracking-[-0.035em] text-[color:var(--color-ink-4)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {currencySymbol(currency)}
            </span>
            <span
              className="text-[64px] font-bold leading-none tracking-[-0.055em] tabular-nums text-[color:var(--color-ink)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {amountDisplay}
            </span>
            <span className="ml-1 inline-block h-[50px] w-[3px] translate-y-2 rounded-full bg-[color:var(--color-cta-ink)]" />
          </div>
        </div>

        {/* Capture methods are expense flows (receipts, wallets); income stays
            a simple manual entry so the sheet keeps one decision per screen. */}
        {!isIncome ? (
          <>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {QUICK_EXPENSE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyQuickPreset(preset)}
                  className="shrink-0 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 py-2 text-[12px] font-semibold text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--color-cta)] hover:text-[color:var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
                >
                  {preset.label} · {formatPresetChipAmount(preset.amount, currency)}
                </button>
              ))}
            </div>
            <div className={cn("mb-3 grid gap-[7px]", AI_ENABLED ? "grid-cols-4" : "grid-cols-2")}>
              {AI_ENABLED ? (
                <>
                  <MethodButton label="Scan" icon={<ScanLine size={17} />} onClick={() => setShowScan(true)} />
                  <MethodButton label="Voice" icon={<Mic size={17} />} onClick={() => setShowVoice(true)} />
                </>
              ) : null}
              <MethodButton label="Apple Pay" icon={<Apple size={17} />} onClick={() => setMessage("Wallet import is not connected yet.")} />
              <MethodButton label="G Pay" icon={<span className="text-[13px] font-bold">G</span>} onClick={() => setMessage("Wallet import is not connected yet.")} />
            </div>
          </>
        ) : null}

        <div className="mb-4 flex gap-2 overflow-x-auto px-1">
          {(activeCategories.length ? activeCategories : fallbackCategories(kind)).slice(0, 8).map((category) => {
            const active = category.id === selectedCategory?.id;
            return (
              <CategoryChip
                size="sm"
                key={category.id}
                category={category}
                active={active}
                onClick={() => setCategoryId(category.id)}
              />
            );
          })}
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was it? (optional)"
          aria-label="Note"
          className="mb-3 h-10 w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3.5 text-[16px] sm:text-[14px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
        />

        <div className="grid grid-cols-3 gap-1.5">
          {KEY_VALUES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => appendKey(key)}
              aria-label={key === "delete" ? "Delete digit" : key}
              className="grid h-[46px] place-items-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[21px] font-semibold tabular-nums text-[color:var(--color-ink)] shadow-[var(--shadow-sm)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {key === "delete" ? <Delete size={18} /> : key}
            </button>
          ))}
        </div>

        </fieldset>
        {message ? (
          <p role="alert" className="mt-3 text-center text-[12px] font-medium text-[color:var(--color-ink-3)]">
            {message}
          </p>
        ) : null}
        </div>

        <button
          type="button"
          onClick={() => queued ? close() : void save()}
          disabled={!queued && !canSave}
          className="mt-3 min-h-[56px] shrink-0 rounded-[18px] bg-[color:var(--color-cta)] px-5 py-3 text-[15px] font-bold text-[color:var(--color-cta-ink)] shadow-[var(--shadow-lg)] transition active:scale-[0.99] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
        >
          {queued ? "Done" : busy
            ? "Adding..."
            : locked ? "Retry save" : isIncome
              ? `Add ${buttonAmount} income · ${selectedName}`
              : `Add ${buttonAmount} to ${selectedName}`}
        </button>
      </section>
      <Suspense fallback={<DialogLoadingFallback />}>
        {showScan ? <ScanDialog open onClose={() => setShowScan(false)} /> : null}
        {showVoice ? <VoiceDialog open onClose={() => setShowVoice(false)} /> : null}
      </Suspense>
    </>
  );
}

function MethodButton({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-14 gap-1 place-items-center rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] py-2 text-[color:var(--color-ink-2)] shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
    >
      <span className="grid min-h-[19px] place-items-center">{icon}</span>
      <span className="text-[9.5px] font-semibold">{label}</span>
    </button>
  );
}


function toIsoDate(d: Date) {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Today keeps the precise capture moment; a backdated pick lands at local noon. */
function occurredAtForIso(iso: string) {
  if (iso === toIsoDate(new Date())) return Date.now();
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).getTime();
}

function friendlyDateLabel(iso: string) {
  if (iso === toIsoDate(new Date())) return "Today";
  if (iso === toIsoDate(new Date(Date.now() - 86400000))) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function nextAmountValue(current: string, key: (typeof KEY_VALUES)[number]) {
  if (key === "delete") {
    const next = current.slice(0, -1);
    return next && next !== "0." ? next : "0";
  }
  if (key === ".") {
    return current.includes(".") ? current : `${current || "0"}.`;
  }
  const decimal = current.split(".")[1];
  if (decimal && decimal.length >= 2) return current;
  const next = current === "0" ? key : `${current}${key}`;
  const [whole] = next.split(".");
  return whole.length > 6 ? current : next;
}

function normalizeDisplayAmount(value: string) {
  if (!value || value === "0") return "0";
  return value.endsWith(".") ? `${value}00`.slice(0, value.length + 2) : value;
}

function formatPresetAmount(value: number) {
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPresetChipAmount(value: number, currency: CurrencyCode) {
  return `${currencySymbol(currency)}${formatPresetAmount(value)}`;
}

function fallbackCategories(kind: "expense" | "income"): Category[] {
  if (kind === "income") {
    return [
      {
        id: "fallback-income",
        portfolioId: "",
        kind: "income",
        name: "Income",
        color: "mint",
        icon: "banknote",
        sortOrder: 0
      }
    ];
  }
  return [
    {
      id: "fallback-expense",
      portfolioId: "",
      kind: "expense",
      name: "Expense",
      color: "mint",
      icon: "shopping-basket",
      sortOrder: 0
    }
  ];
}
