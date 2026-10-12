import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Minus, Plus, Repeat, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { CategoryDialog } from "@/components/features/CategoryDialog";
import { CategoryIcon, tonesFor } from "@/components/features/CategoryIcon";
import { cn } from "@/lib/cn";
import {
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  useCurrentUser,
  useMemberships,
  usePortfolio,
  useTransactions
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/money";
import { getCurrentPosition, reverseGeocode, type GeoError } from "@/lib/geocode";
import { useAppMode } from "@/lib/appMode";
import { occurredAtFromIsoDate } from "@/lib/occurredAt";
import type { CurrencyCode } from "@/lib/types";

type Kind = "income" | "expense";

interface Props {
  open: boolean;
  onClose: () => void;
  initialKind?: Kind;
  initialCategoryId?: string;
}

/**
 * Build a description → most-frequent-categoryId map from past transactions.
 * Used to auto-pick a category when the user picks a known merchant.
 * Case-insensitive on description.
 */
function buildSuggestionMaps(transactions: ReturnType<typeof useTransactions>) {
  // distinct descriptions sorted by recency (newest first; keeps the list relevant)
  const seen = new Set<string>();
  const recentDescriptions: string[] = [];
  for (const tx of transactions) {
    const key = tx.description.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    recentDescriptions.push(tx.description.trim());
    if (recentDescriptions.length >= 50) break;
  }
  // description → category-id with the highest count
  const descToCategoryCounts = new Map<string, Map<string, number>>();
  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    const key = tx.description.trim().toLowerCase();
    if (!key) continue;
    const counts = descToCategoryCounts.get(key) ?? new Map();
    counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
    descToCategoryCounts.set(key, counts);
  }
  const bestCategoryFor: Record<string, string> = {};
  for (const [desc, counts] of descToCategoryCounts) {
    let best: string | undefined;
    let max = 0;
    for (const [catId, n] of counts) {
      if (n > max) {
        max = n;
        best = catId;
      }
    }
    if (best) bestCategoryFor[desc] = best;
  }
  return { recentDescriptions, bestCategoryFor };
}

/**
 * Friendly date label — "Today", "Yesterday", "Tomorrow", or "12 Apr".
 * The MonAI mock uses "Today" on the date pill; we keep that vibe but
 * gracefully degrade for picked dates.
 */
function friendlyDateLabel(iso: string): string {
  if (!iso) return "Today";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function AddTransactionDialog({
  open,
  onClose,
  initialKind,
  initialCategoryId
}: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const memberships = useMemberships(portfolio.id);
  const categories = useCategories(portfolio.id);
  const allAssets = useAssets(portfolio.id);
  const cashAccounts = allAssets.filter((a) => a.kind === "cash");
  const transactions = useTransactions(portfolio.id);
  const actions = useDomainActions();
  const [appMode] = useAppMode();
  // Light mode trims this dialog down to the four fields a casual user needs:
  // description, amount, category, date. Currency stays at the portfolio
  // default, account auto-links to the first cash account, location is off.
  // Light mode is also expense-only — no kind toggle, no income green pill.
  const isLight = appMode === "light";

  const { recentDescriptions, bestCategoryFor } = useMemo(
    () => buildSuggestionMaps(transactions),
    [transactions]
  );

  const [kind, setKind] = useState<Kind>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(portfolio.defaultCurrency);
  const [categoryId, setCategoryId] = useState<string>(
    categories.find((c) => c.kind === "expense")?.id ?? ""
  );
  const [paidBy, setPaidBy] = useState<string>(me.id);
  const [accountId, setAccountId] = useState<string>(cashAccounts[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [location, setLocation] = useState<
    { lat: number; lng: number; label?: string } | null
  >(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Toggling this opens the in-place CategoryDialog so the user can mint a
  // new category from the "+" chip without leaving the add-transaction flow.
  const [creatingCategoryKind, setCreatingCategoryKind] = useState<Kind | null>(null);

  const firstExpenseCategoryId = categories.find((c) => c.kind === "expense")?.id ?? "";
  const firstIncomeCategoryId = categories.find((c) => c.kind === "income")?.id ?? "";
  const firstCashAccountId = cashAccounts[0]?.id ?? "";

  // Hidden native date input — the visible "Today" pill triggers this so we
  // get OS-native date pickers on mobile without owning a custom popover.
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const nextKind = initialKind ?? "expense";
    const fallbackCategory =
      nextKind === "income" ? firstIncomeCategoryId : firstExpenseCategoryId;
    setKind(nextKind);
    setCategoryId(initialCategoryId ?? fallbackCategory);
    setCurrency(portfolio.defaultCurrency);
    setPaidBy(me.id);
    setAccountId(firstCashAccountId);
    setOccurredAt(new Date().toISOString().slice(0, 10));
    setMoreOpen(false);
  }, [
    open,
    initialKind,
    initialCategoryId,
    firstExpenseCategoryId,
    firstIncomeCategoryId,
    firstCashAccountId,
    portfolio.defaultCurrency,
    me.id
  ]);

  async function captureLocation() {
    setGeoBusy(true);
    setGeoError(null);
    try {
      const coords = await getCurrentPosition();
      // Set coords immediately so the UI confirms capture before Nominatim
      // (which takes ~300-1500ms) resolves. Label is filled in on success.
      setLocation({ lat: coords.lat, lng: coords.lng });
      const label = await reverseGeocode(coords.lat, coords.lng);
      setLocation((prev) =>
        prev && prev.lat === coords.lat && prev.lng === coords.lng
          ? { ...prev, label: label ?? undefined }
          : prev
      );
    } catch (err) {
      const e = err as GeoError;
      setGeoError(
        e.code === "denied"
          ? "Location blocked — enable in browser settings."
          : e.code === "timeout"
            ? "Location request timed out."
            : "Location is unavailable."
      );
    } finally {
      setGeoBusy(false);
    }
  }

  const visibleCats = categories.filter((c) => c.kind === kind);
  const isShared = memberships.length > 1;
  const categoryWasAutoPicked = useMemo(() => {
    const key = description.trim().toLowerCase();
    return !!key && bestCategoryFor[key] === categoryId && categoryId !== "";
  }, [description, bestCategoryFor, categoryId]);

  function applyDescription(value: string) {
    setDescription(value);
    const key = value.trim().toLowerCase();
    const guess = bestCategoryFor[key];
    if (guess && visibleCats.some((c) => c.id === guess)) {
      setCategoryId(guess);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !description.trim()) return;
    await actions.createTransaction({
      portfolioId: portfolio.id,
      occurredAt: occurredAtFromIsoDate(occurredAt),
      description: description.trim(),
      categoryId: categoryId || visibleCats[0]?.id,
      accountId: accountId || undefined,
      kind,
      amount: numericAmount,
      currency,
      createdByUserId: isShared ? paidBy : me.id,
      location: location ?? undefined
    });
    setDescription("");
    setAmount("");
    setCurrency(portfolio.defaultCurrency);
    setPaidBy(me.id);
    setLocation(null);
    setGeoError(null);
    setMoreOpen(false);
    onClose();
  }

  // Form validity drives the Save button's disabled state — same rules as
  // submit() so a tap doesn't silently no-op.
  const numericAmount = Number(amount);
  const formValid =
    description.trim().length > 0 &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0;

  // MonAI mock: amount in big display type, red for expense + green for
  // income. Light mode is expense-only, so the colour is always negative.
  const amountColor =
    kind === "income"
      ? "var(--color-positive)"
      : "var(--color-negative)";

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Add transaction">
      <form onSubmit={submit} className="flex flex-col gap-5">
        {/* Top row: friendly date pill + "Once" recurrence pill.
            Matches the MonAI mock — date opens the native picker, recurrence
            is informational ("Once" === non-recurring tx, this dialog doesn't
            create RecurringTransactions). */}
        <div className="flex items-center gap-2">
          {/* The transparent date input IS the click target (overlaying the
              pill), so the native picker opens from a direct click in every
              browser. showPicker() on a clipped sr-only input silently fails
              in Safari/standalone-PWA contexts — never rely on it alone. */}
          <div className="relative inline-flex rounded-full focus-within:ring-2 focus-within:ring-[color:var(--color-brand-soft)]">
            <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-2)] text-[13px] font-semibold hover:bg-[color:var(--color-cream-200)] transition-colors">
              {friendlyDateLabel(occurredAt)}
            </span>
            <input
              ref={dateInputRef}
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              onClick={() => {
                const el = dateInputRef.current;
                if (!el || typeof el.showPicker !== "function") return;
                try {
                  el.showPicker();
                } catch {
                  // Browsers that refuse (no gesture context, etc.) still get
                  // the input's own native click/focus behavior.
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Date"
            />
          </div>
          <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)] text-[13px] font-semibold">
            <Repeat size={12} strokeWidth={2} />
            Once
          </span>
        </div>

        {/* Description — no Field label, the placeholder doubles as the
            label per MonAI mock. Reads as "Description" when empty, replaced
            by the user's text in the same large face. */}
        <div>
          <input
            type="text"
            aria-label={isLight ? "What did you spend on?" : "Description"}
            placeholder={
              isLight
                ? "Coffee, groceries, gas…"
                : "Mercadona, salary, Spotify…"
            }
            value={description}
            onChange={(e) => applyDescription(e.target.value)}
            list="numa-recent-descriptions"
            className="w-full bg-transparent border-0 outline-none text-[26px] sm:text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] placeholder:font-medium"
          />
          <datalist id="numa-recent-descriptions">
            {recentDescriptions.slice(0, 30).map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        {/* Amount row — big number input plus inline sign toggle.
            Light mode hides the income pill (expense-only), per the user's
            instruction. The minus circle becomes a static affordance there. */}
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              {/* Sign glyph — sits next to the number in the same big face. */}
              <span
                aria-hidden
                className="text-[44px] sm:text-[48px] font-semibold leading-none tracking-[-0.02em]"
                style={{ color: amountColor }}
              >
                {kind === "income" ? "+" : "−"}
              </span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Amount"
                placeholder="12.50"
                value={amount}
                onChange={(e) => {
                  // Accept digits with optional . or , — keep raw, parse via Number()
                  const raw = e.target.value.replace(",", ".");
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                    setAmount(raw);
                  }
                }}
                className="w-full bg-transparent border-0 outline-none text-[44px] sm:text-[48px] font-semibold tracking-[-0.02em] leading-none placeholder:text-[color:var(--color-ink-3)] placeholder:font-medium tabular-nums"
                style={{ color: amount ? amountColor : "var(--color-ink-3)" }}
              />
              <span
                className="text-[20px] font-semibold text-[color:var(--color-ink-3)] shrink-0 nm-num"
              >
                {currency === "EUR"
                  ? "€"
                  : currency === "USD"
                    ? "$"
                    : currency === "GBP"
                      ? "£"
                      : currency}
              </span>
            </div>
          </div>

          {/* +/- segmented control — red minus = expense, green plus = income.
              Light mode collapses this to a static minus indicator. */}
          {isLight ? (
            <span
              aria-hidden
              className="grid place-items-center w-11 h-11 rounded-full bg-[color:var(--color-negative-mist)] text-[color:var(--color-negative)] shrink-0"
            >
              <Minus size={20} strokeWidth={2.5} />
            </span>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setKind("expense");
                  setCategoryId(firstExpenseCategoryId);
                }}
                aria-label="Expense"
                aria-pressed={kind === "expense"}
                className={cn(
                  "grid place-items-center w-11 h-11 rounded-full transition-all",
                  kind === "expense"
                    ? "bg-[color:var(--color-negative)] text-[color:var(--color-paper)] shadow-[var(--shadow-sm)] scale-105"
                    : "bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-cream-200)]"
                )}
              >
                <Minus size={20} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind("income");
                  setCategoryId(firstIncomeCategoryId);
                }}
                aria-label="Income"
                aria-pressed={kind === "income"}
                className={cn(
                  "grid place-items-center w-11 h-11 rounded-full transition-all",
                  kind === "income"
                    ? "bg-[color:var(--color-positive)] text-[color:var(--color-paper)] shadow-[var(--shadow-sm)] scale-105"
                    : "bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-cream-200)]"
                )}
              >
                <Plus size={20} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>

        {/* Horizontal scroll of category chips. First chip is "+" to mint a
            new category in-place. Tapping a chip assigns it. Auto-picked from
            the description suggestion ribbon shows a sparkle hint. */}
        <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto">
          <div className="flex items-center gap-2 pb-1">
            <button
              type="button"
              onClick={() => setCreatingCategoryKind(kind)}
              aria-label="Create new category"
              className="grid place-items-center w-12 h-12 rounded-full bg-[color:var(--color-cream-100)] border border-[color:var(--color-line)] text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-cream-200)] transition-colors shrink-0"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            {visibleCats.length === 0 ? (
              <span className="text-[12.5px] text-[color:var(--color-ink-4)] px-2">
                No categories yet — tap + to add one.
              </span>
            ) : (
              visibleCats.map((cat) => {
                const tone = tonesFor(cat.color);
                const active = cat.id === categoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-12 pl-1.5 pr-3 rounded-full border whitespace-nowrap transition-all shrink-0",
                      active
                        ? "border-[color:var(--color-ink)] bg-[color:var(--color-paper)] shadow-[var(--shadow-sm)] scale-[1.02]"
                        : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] hover:bg-[color:var(--color-cream-50)]"
                    )}
                  >
                    <span
                      className="grid place-items-center w-9 h-9 rounded-full relative shrink-0"
                      style={{ background: tone.surface, color: tone.ink }}
                    >
                      {cat.emoji ? (
                        <span className="nm-emoji text-[16px] leading-none">{cat.emoji}</span>
                      ) : (
                        <CategoryIcon name={cat.icon} size={16} />
                      )}
                    </span>
                    <span className="text-[13px] font-semibold text-[color:var(--color-ink)]">
                      {cat.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {categoryWasAutoPicked ? (
            <p className="text-[11.5px] text-[color:var(--color-brand-strong)] mt-1.5">
              Auto-picked from past entries.
            </p>
          ) : null}
        </div>

        {/* Advanced extras live in a collapsible "More" drawer so the canvas
            stays focused on description+amount+category — which is what the
            MonAI mock prioritises. Light mode skips it entirely (date pill at
            top + the global portfolio = enough). */}
        {!isLight ? (
          <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)]/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="w-full h-11 px-3.5 flex items-center justify-between gap-3 text-left"
            >
              <span className="text-[12.5px] font-semibold text-[color:var(--color-ink-2)]">
                More
              </span>
              <span className="text-[11.5px] text-[color:var(--color-ink-4)]">
                {currency}
                {accountId ? " · account linked" : ""}
                {location ? " · location" : ""}
                {moreOpen ? " ▾" : " ▸"}
              </span>
            </button>
            {moreOpen ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-3.5 pb-3.5 pt-1">
                <label className="flex flex-col gap-1">
                  <span className="text-[11.5px] font-semibold text-[color:var(--color-ink-3)] uppercase tracking-[0.06em]">
                    Currency
                  </span>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="h-11 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)]"
                  >
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                {cashAccounts.length > 0 ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11.5px] font-semibold text-[color:var(--color-ink-3)] uppercase tracking-[0.06em]">
                      From account
                    </span>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="h-11 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)]"
                    >
                      <option value="">No account</option>
                      {cashAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {formatMoney(a.balance, a.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isShared ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11.5px] font-semibold text-[color:var(--color-ink-3)] uppercase tracking-[0.06em]">
                      Paid by
                    </span>
                    <select
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                      className="h-11 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[14px] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)]"
                    >
                      {memberships.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.displayName}
                          {m.userId === me.id ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="sm:col-span-2">
                  {location ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[color:var(--color-brand-mist)] border border-[color:var(--color-brand-soft)]">
                      <MapPin size={14} className="text-[color:var(--color-brand-strong)] shrink-0" />
                      <span className="text-[12.5px] text-[color:var(--color-ink-2)] truncate flex-1">
                        {location.label ?? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setLocation(null);
                          setGeoError(null);
                        }}
                        aria-label="Clear location"
                        className="text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink-2)]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={captureLocation}
                      disabled={geoBusy}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[color:var(--color-brand-strong)] hover:text-[color:var(--color-brand)] disabled:opacity-50"
                    >
                      <MapPin size={13} />
                      {geoBusy ? "Capturing location…" : "Add location"}
                    </button>
                  )}
                  {geoError ? (
                    <p className="text-[11.5px] text-[color:var(--color-negative)] mt-1.5">{geoError}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Save row — large primary action. The Dialog already provides the
            top-right X close, so we don't repeat a "Cancel" button here. */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="submit"
            disabled={!formValid}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] text-[14px] font-semibold hover:bg-[color:var(--color-cta-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
          >
            <Check size={16} strokeWidth={2.5} />
            Save
          </button>
        </div>
      </form>

      {/* In-place category creator — fires when the user taps the "+" chip.
          Once the new category is committed the dialog closes itself and the
          newly-added category will appear in `visibleCats` on the next
          render (categories are subscribed via `useCategories`). */}
      <CategoryDialog
        open={creatingCategoryKind !== null}
        onClose={() => setCreatingCategoryKind(null)}
        editing={null}
        defaultKind={creatingCategoryKind ?? kind}
      />
    </Dialog>
  );
}
