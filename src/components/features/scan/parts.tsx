import { useEffect } from "react";
import {
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ScanLine,
  Sparkles,
  Wallet,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Field, Select, TextInput } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { type ScanResult, type ScanTransaction } from "@/services/scanReceipt";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { backdropMotion, sheetMotion } from "@/lib/motion";
import type { Asset, Category, CurrencyCode } from "@/lib/types";
import { type EditableTx } from "./shared";

export function InputState({
  quota,
  onCamera,
  onGallery
}: {
  quota: { used: number; limit: number; remaining: number };
  onCamera: () => void;
  onGallery: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-[color:var(--color-surface-inverse)] text-[color:var(--color-on-inverse)] shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between px-5 pt-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-on-inverse-faint)] text-[color:var(--color-on-inverse)]">
          <ScanLine size={17} strokeWidth={1.9} />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-on-inverse-dim)]">
          scan receipt
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-on-inverse-faint)] text-[color:var(--color-on-inverse)]">
          <ImageIcon size={17} strokeWidth={1.9} />
        </span>
      </div>
      <div className="grid place-items-center px-7 py-8">
        <ReceiptViewfinder />
      </div>
      <div className="rounded-t-[24px] bg-[color:var(--color-paper)] px-4 pb-4 pt-4 text-[color:var(--color-ink)]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[color:var(--color-brand)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-brand)]">
            ready to read
          </span>
          <span className="ml-auto font-mono text-[11px] text-[color:var(--color-ink-3)]">
            {quota.used}/{quota.limit}
          </span>
        </div>
        <p className="mt-2 text-[14px] font-semibold leading-tight">
          Snap a receipt, bank screen, or broker statement.
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
          Numa Pro drafts the movement first. You review every transaction before it saves.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCamera}
            className="nm-interactive inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--color-brand)] text-[13px] font-bold text-[color:var(--color-cta-ink)]"
          >
            <Camera size={15} />
            Camera
          </button>
          <button
            type="button"
            onClick={onGallery}
            className="nm-interactive inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[color:var(--color-line)] bg-transparent text-[13px] font-semibold text-[color:var(--color-ink)]"
          >
            <ImageIcon size={15} />
            Gallery
          </button>
        </div>
        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-[color:var(--color-ink-3)]">
          Paste with <span className="font-mono">Cmd+V</span> or drop a file here.
        </p>
      </div>
    </div>
  );
}

export function ReceiptViewfinder({
  imagePreview,
  label,
  onZoom
}: {
  imagePreview?: string | null;
  label?: string;
  onZoom?: () => void;
}) {
  const receipt = (
    <div className="absolute inset-4 overflow-hidden rounded-md bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.08)_0_14px,transparent_14px_22px)] p-5">
      {imagePreview ? (
        <img
          src={imagePreview}
          alt="Receipt preview"
          className="h-full w-full rounded object-cover opacity-80"
        />
      ) : (
        <div className="flex h-full flex-col gap-3">
          <span className="h-2.5 w-3/5 rounded bg-[color:var(--color-on-inverse-faint)]/20" />
          <span className="h-1.5 w-5/6 rounded bg-[color:var(--color-on-inverse-faint)]" />
          <span className="h-1.5 w-2/3 rounded bg-[color:var(--color-on-inverse-faint)]" />
          <span className="mt-auto h-1.5 w-4/5 rounded bg-[color:var(--color-on-inverse-faint)]" />
        </div>
      )}
    </div>
  );
  return (
    <button
      type="button"
      onClick={onZoom}
      disabled={!onZoom || !imagePreview}
      aria-label={imagePreview ? "Open full-size preview" : undefined}
      className={cn(
        "relative h-[260px] w-[210px]",
        imagePreview && onZoom ? "cursor-zoom-in" : "cursor-default"
      )}
    >
      <ScanCorner position="tl" />
      <ScanCorner position="tr" />
      <ScanCorner position="bl" />
      <ScanCorner position="br" />
      {receipt}
      <span className="absolute left-2 right-2 top-1/2 h-0.5 bg-[color:var(--color-cta-ink)] shadow-[0_0_18px_var(--color-cta-ink)]" />
      {label ? (
        <span className="absolute inset-x-0 -bottom-7 text-center text-[12px] font-medium text-[color:var(--color-on-inverse-dim)]">
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function ScanCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  return (
    <span
      className={cn(
        "absolute h-7 w-7 border-[3px] border-[color:var(--color-cta-ink)]",
        position === "tl" && "left-0 top-0 rounded-tl-lg border-b-0 border-r-0",
        position === "tr" && "right-0 top-0 rounded-tr-lg border-b-0 border-l-0",
        position === "bl" && "bottom-0 left-0 rounded-bl-lg border-r-0 border-t-0",
        position === "br" && "bottom-0 right-0 rounded-br-lg border-l-0 border-t-0"
      )}
    />
  );
}

export function ProgressState({
  imagePreview,
  label,
  onZoom
}: {
  imagePreview: string | null;
  label: string;
  onZoom: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-[color:var(--color-surface-inverse)] text-[color:var(--color-on-inverse)] shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between px-5 pt-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-on-inverse-faint)] text-[color:var(--color-on-inverse)]">
          <Loader2 size={17} className="animate-spin" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-on-inverse-dim)]">
          scan receipt
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-on-inverse-faint)] text-[color:var(--color-on-inverse)]">
          <ScanLine size={17} strokeWidth={1.9} />
        </span>
      </div>
      <div className="grid place-items-center px-7 py-8">
        <ReceiptViewfinder imagePreview={imagePreview} label={label} onZoom={onZoom} />
      </div>
      <div className="rounded-t-[24px] bg-[color:var(--color-paper)] px-4 pb-4 pt-4 text-[color:var(--color-ink)]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[color:var(--color-brand)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-brand)]">
            reading it
          </span>
        </div>
        <p className="mt-2 text-[14px] font-semibold leading-tight">{label}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
          We compress locally first, then ask the parser for draft transactions.
        </p>
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  imagePreview,
  onZoom,
  onRetry
}: {
  message: string;
  imagePreview: string | null;
  onZoom: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      {imagePreview ? (
        <button
          type="button"
          onClick={onZoom}
          className="cursor-zoom-in"
          aria-label="Open full-size preview"
        >
          <img
            src={imagePreview}
            alt="Preview"
            className="w-24 h-24 rounded-2xl object-cover border border-[color:var(--color-line)] shadow-[var(--shadow-sm)]"
          />
        </button>
      ) : (
        <span className="grid place-items-center w-12 h-12 rounded-2xl bg-[color:var(--color-negative-soft)] text-[color:var(--color-negative)]">
          <X size={20} strokeWidth={2.25} />
        </span>
      )}
      <p className="text-[13px] text-[color:var(--color-ink-2)]">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        <RefreshCw size={14} />
        Try again
      </Button>
    </div>
  );
}

export function RejectedState({
  rejection,
  subject,
  imagePreview,
  onZoom,
  onRetry
}: {
  rejection: string;
  subject: string;
  imagePreview: string | null;
  onZoom: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      {imagePreview ? (
        <button type="button" onClick={onZoom} className="cursor-zoom-in" aria-label="Open full-size preview">
          <img
            src={imagePreview}
            alt="Preview"
            className="w-24 h-24 rounded-2xl object-cover border border-[color:var(--color-line)] shadow-[var(--shadow-sm)]"
          />
        </button>
      ) : (
        <span className="grid place-items-center w-12 h-12 rounded-2xl bg-[color:var(--color-surface-peach)] text-[color:var(--color-peach-ink)]">
          <Sparkles size={20} strokeWidth={2.25} />
        </span>
      )}
      <p className="text-[14px] font-medium text-[color:var(--color-ink)]">{rejection}</p>
      <p className="text-[12px] text-[color:var(--color-ink-3)]">I saw: {subject}</p>
      <Button variant="primary" onClick={onRetry}>
        <ScanLine size={14} />
        Upload something else
      </Button>
    </div>
  );
}

export function ReviewState({
  result,
  editable,
  categories,
  cashAccounts,
  currency,
  imagePreview,
  onZoom,
  onUpdate,
  onConfirm,
  onCancel,
  syncNotice
}: {
  result: ScanResult;
  editable: EditableTx[];
  categories: Category[];
  cashAccounts: Asset[];
  currency: CurrencyCode;
  imagePreview: string | null;
  onZoom: () => void;
  onUpdate: (uid: string, patch: Partial<EditableTx>) => void;
  onConfirm: () => void;
  onCancel: () => void;
  syncNotice: string | null;
}) {
  const includedCount = editable.filter(
    (r) => !r.applied && r.include && (r.kind === "income" || r.kind === "expense")
  ).length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[color:var(--color-cream-50)] px-4 py-3 flex items-start gap-3">
        {imagePreview ? (
          <button
            type="button"
            onClick={onZoom}
            className="shrink-0 cursor-zoom-in"
            aria-label="Open full-size preview"
          >
            <img
              src={imagePreview}
              alt="Preview"
              className="w-16 h-16 rounded-xl object-cover border border-[color:var(--color-line)]"
            />
          </button>
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)] font-semibold">
            {imageTypeLabel(result.imageType)}
          </p>
          <p className="text-[13px] text-[color:var(--color-ink)] mt-0.5">{result.summary}</p>
        </div>
      </div>

      {syncNotice ? (
        <p className="rounded-2xl border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-4 py-3 text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">
          {syncNotice}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 max-h-[44vh] overflow-y-auto pr-1 -mr-1">
        {editable.map((row) => (
          <ScanRowEditor
            key={row.uid}
            row={row}
            categories={categories}
            cashAccounts={cashAccounts}
            portfolioCurrency={currency}
            onUpdate={(patch) => onUpdate(row.uid, patch)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={includedCount === 0}>
          <Check size={14} />
          {includedCount === 1 ? "Add transaction" : `Add ${includedCount} transactions`}
        </Button>
      </div>
    </div>
  );
}

export function ScanRowEditor({
  row,
  categories,
  cashAccounts,
  portfolioCurrency,
  onUpdate
}: {
  row: EditableTx;
  categories: Category[];
  cashAccounts: Asset[];
  portfolioCurrency: CurrencyCode;
  onUpdate: (patch: Partial<EditableTx>) => void;
}) {
  const supported = row.kind === "income" || row.kind === "expense";
  const today = new Date().toISOString().slice(0, 10);
  const visibleCats = categories.filter(
    (c) => c.kind === (row.kind === "income" ? "income" : "expense")
  );
  const resolvedCurrency = row.currency === "UNKNOWN" ? portfolioCurrency : row.currency;
  const currencyMismatch = row.currency !== "UNKNOWN" && row.currency !== portfolioCurrency;
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3 flex flex-col gap-3 transition-colors",
        row.include
          ? "border-[color:var(--color-brand)]/40 bg-[color:var(--color-paper)]"
          : "border-[color:var(--color-line)] bg-[color:var(--color-cream-50)]/60",
        !supported || row.applied ? "opacity-70" : ""
      )}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          aria-label={`Include ${row.description || row.merchantOrCounterparty || "transaction"}`}
          checked={row.include && supported}
          disabled={!supported || row.applied}
          onChange={(e) => onUpdate({ include: e.target.checked })}
          className="accent-[color:var(--color-brand)] w-4 h-4"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">
            {row.description || row.merchantOrCounterparty || "Transaction"}
          </p>
          <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">
            {row.queued ? "Saved for sync" : row.applied ? "Saved" : row.merchantOrCounterparty ?? ""}
            {row.notes ? ` · ${row.notes}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "text-[14px] font-semibold nm-num",
              row.kind === "income"
                ? "text-[color:var(--color-positive)]"
                : "text-[color:var(--color-ink)]"
            )}
          >
            {row.kind === "income" ? "+" : row.kind === "expense" ? "−" : ""}
            {formatMoney(row.amount, resolvedCurrency)}
          </p>
          <p className="text-[10.5px] text-[color:var(--color-ink-4)] uppercase tracking-[0.08em]">
            {row.currency === "UNKNOWN" ? `${portfolioCurrency} (guessed)` : row.currency}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <Select
            value={row.kind}
            disabled={row.applied}
            onChange={(e) => onUpdate({ kind: e.target.value as ScanTransaction["kind"] })}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="settlement">Settlement</option>
            <option value="holding">Investment</option>
            <option value="unknown">Unknown</option>
          </Select>
        </Field>
        <Field label={`Amount (${resolvedCurrency})`}>
          <TextInput
            type="number"
            step="0.01"
            min="0"
            value={row.amount}
            disabled={row.applied}
            onChange={(e) => onUpdate({ amount: Number(e.target.value) })}
          />
        </Field>
        <Field label="Date">
          <TextInput
            type="date"
            value={row.occurredAt ?? today}
            disabled={row.applied}
            onChange={(e) => onUpdate({ occurredAt: e.target.value })}
          />
        </Field>
        <Field label="Category">
          <Select
            value={
              row.categoryToCreate
                ? "__create__"
                : row.suggestedCategoryId ?? ""
            }
            onChange={(e) => {
              if (e.target.value === "__create__") {
                onUpdate({
                  categoryToCreate: row.suggestedCategoryName ?? "New category",
                  suggestedCategoryId: null
                });
              } else {
                onUpdate({
                  categoryToCreate: null,
                  suggestedCategoryId: e.target.value || null
                });
              }
            }}
            disabled={!supported || row.applied}
          >
            <option value="">Uncategorised</option>
            {visibleCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {row.suggestedCategoryName ? (
              <option value="__create__">+ Create "{row.suggestedCategoryName}"</option>
            ) : null}
          </Select>
        </Field>
        {cashAccounts.length > 0 ? (
          <Field
            label="From account"
            hint="Balance will move accordingly"
          >
            <Select
              value={row.accountId ?? ""}
              onChange={(e) => onUpdate({ accountId: e.target.value || null })}
              disabled={!supported || row.applied}
            >
              <option value="">No account</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance, a.currency)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="From account" hint="No cash account yet. Add one in Wealth → Assets.">
            <div className="h-10 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] flex items-center gap-2 text-[12px] text-[color:var(--color-ink-4)]">
              <Wallet size={13} />
              No accounts yet
            </div>
          </Field>
        )}
      </div>
      {currencyMismatch ? (
        <p className="text-[11.5px] text-[color:var(--color-warning)] flex items-center gap-1.5">
          Currency on the receipt ({row.currency}) differs from this portfolio ({portfolioCurrency}). It will be saved as-is.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-[color:var(--color-ink-3)] uppercase tracking-[0.06em] font-semibold mr-1">
          Confidence
        </span>
        <ConfidenceChip label="amount" value={row.confidence.amount} />
        <ConfidenceChip label="date" value={row.confidence.date} />
        <ConfidenceChip label="category" value={row.confidence.category} />
      </div>
    </div>
  );
}

export function ConfidenceChip({ label, value }: { label: string; value: number }) {
  const tone = value >= 0.85 ? "positive" : value >= 0.55 ? "warning" : "negative";
  return (
    <Pill tone={tone}>
      {label} {Math.round(value * 100)}%
    </Pill>
  );
}

export function Lightbox({ image, onClose }: { image: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <AnimatePresence>
      <motion.div
        {...backdropMotion}
        className="fixed inset-0 z-[60] bg-[color:var(--color-scrim-strong)] grid place-items-center p-6"
        onClick={onClose}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 grid place-items-center w-10 h-10 rounded-full bg-[color:var(--color-paper)]/10 hover:bg-[color:var(--color-paper)]/20 text-white"
        >
          <X size={18} />
        </button>
        <motion.img
          {...sheetMotion}
          exit={{ scale: 0.96, opacity: 0 }}
          src={image}
          alt="Receipt preview"
          className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </motion.div>
    </AnimatePresence>
  );
}

export function imageTypeLabel(type: ScanResult["imageType"]) {
  switch (type) {
    case "bank_transaction":
      return "Bank transaction";
    case "bank_statement":
      return "Bank statement";
    case "physical_receipt":
      return "Paper receipt";
    case "payment_app_screenshot":
      return "Payment app screenshot";
    case "investment_screenshot":
      return "Brokerage screen";
    case "crypto_screenshot":
      return "Crypto wallet";
    case "other_financial":
      return "Financial document";
    default:
      return "Not a receipt";
  }
}
