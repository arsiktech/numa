import { useEffect, useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { Dialog, Field, Select, TextInput } from "@/components/ui/Dialog";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { DialogFooter, useConfirmDelete } from "@/components/ui/DialogFooter";
import {
  nextRunAfter,
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  usePortfolio
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useUndo } from "@/services/undo";
import type {
  CurrencyCode,
  RecurrenceCadence,
  RecurringTransaction,
  RevenueType,
  TxKind
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: RecurringTransaction | null;
}

const CADENCES: { value: RecurrenceCadence; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Every year" }
];

function toDateInput(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function RecurringDialog({ open, onClose, editing }: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const categories = useCategories(portfolioId);
  const assets = useAssets(portfolioId);
  const cashAccounts = useMemo(() => assets.filter((a) => a.kind === "cash"), [assets]);
  const actions = useDomainActions();
  const { push: pushUndo } = useUndo();

  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<TxKind>("expense");
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState<CurrencyCode>(portfolio.defaultCurrency);
  const [cadence, setCadence] = useState<RecurrenceCadence>("monthly");
  const [categoryId, setCategoryId] = useState<string | "">("");
  const [accountId, setAccountId] = useState<string | "">("");
  const [startAt, setStartAt] = useState(toDateInput(Date.now()));
  const [endAt, setEndAt] = useState<string>("");
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [revenueType, setRevenueType] = useState<RevenueType | "">("");
  const [incomeSource, setIncomeSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, arm: armDelete, disarm } = useConfirmDelete();

  useEffect(() => {
    if (!open) return;
    setError(null);
    disarm();
    if (editing) {
      setDescription(editing.description);
      setKind(editing.kind);
      setAmount(editing.amount.toString());
      setCurrency(editing.currency);
      setCadence(editing.cadence);
      setCategoryId(editing.categoryId ?? "");
      setAccountId(editing.accountId ?? "");
      setStartAt(toDateInput(editing.startAt));
      setEndAt(editing.endAt ? toDateInput(editing.endAt) : "");
      setActive(editing.active);
      setNotes(editing.notes ?? "");
      setRevenueType(editing.revenueType ?? "");
      setIncomeSource(editing.incomeSource ?? "");
    } else {
      setDescription("");
      setKind("expense");
      setAmount("0");
      setCurrency(portfolio.defaultCurrency);
      setCadence("monthly");
      setCategoryId("");
      setAccountId("");
      setStartAt(toDateInput(Date.now()));
      setEndAt("");
      setActive(true);
      setNotes("");
      setRevenueType("");
      setIncomeSource("");
    }
  }, [disarm, open, editing, portfolio.defaultCurrency]);

  const filteredCategories = categories.filter((c) => c.kind === kind);
  const isBusiness = portfolio.spaceKind === "business";
  // Only income can be revenue; MRR is a business-space concept.
  const savedRevenueType = kind === "income" && isBusiness && revenueType ? revenueType : undefined;
  const savedIncomeSource = kind === "income" ? incomeSource.trim() || undefined : undefined;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) {
      setError("Description is required.");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    const startTs = new Date(startAt).getTime();
    if (!Number.isFinite(startTs)) {
      setError("Start date is invalid.");
      return;
    }
    const endTs = endAt ? new Date(endAt).getTime() : undefined;
    if (endTs && endTs < startTs) {
      setError("End date can't be before start.");
      return;
    }
    if (savedIncomeSource && savedIncomeSource.length > 80) {
      setError("Client or source must be 80 characters or fewer.");
      return;
    }

    if (editing) {
      await actions.updateRecurring(editing.id, {
        description: trimmed,
        kind,
        amount: numericAmount,
        currency,
        cadence,
        categoryId: categoryId || undefined,
        accountId: accountId || undefined,
        startAt: startTs,
        endAt: endTs,
        active,
        notes: notes.trim() || undefined,
        revenueType: savedRevenueType ?? null,
        incomeSource: savedIncomeSource ?? null
      });
      onClose();
      return;
    }

    // For new ones, nextRunAt is either the startAt (if it's in the future)
    // or the next computed occurrence after now.
    const now = Date.now();
    let nextRunAt = startTs;
    while (nextRunAt < now) {
      nextRunAt = nextRunAfter(nextRunAt, cadence);
    }

    await actions.createRecurring({
      portfolioId,
      description: trimmed,
      kind,
      amount: numericAmount,
      currency,
      cadence,
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
      startAt: startTs,
      nextRunAt,
      endAt: endTs,
      active,
      notes: notes.trim() || undefined,
      revenueType: savedRevenueType,
      incomeSource: savedIncomeSource,
      createdAt: now
    });
    onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      armDelete();
      return;
    }
    // Recurring transactions live only in the local store today (no cloud
    // bridge), so the id round-trips cleanly. Snapshot preserves nextRunAt etc.
    const snapshot: RecurringTransaction = { ...editing };
    await actions.deleteRecurring(editing.id, editing.portfolioId);
    pushUndo({
      message: `Recurring "${snapshot.description}" deleted`,
      onUndo: () => {
        void actions.createRecurring(snapshot);
      }
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit recurring" : "New recurring transaction"}
      description="Salary, rent, Netflix — anything that fires on a schedule."
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="What is it?">
          <TextInput
            placeholder="Rent, salary, Spotify, mortgage payment…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as TxKind)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>
          <Field label="Cadence">
            <Select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as RecurrenceCadence)}
            >
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category (optional)">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— None —</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From account (optional)">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— None —</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts on">
            <TextInput
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </Field>
          <Field label="Ends on (optional)">
            <TextInput
              type="date"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </Field>
        </div>
        {kind === "income" ? (
          <div className={isBusiness ? "grid grid-cols-2 gap-3" : undefined}>
            <Field label="Client or source (optional)">
              <TextInput
                placeholder="Acme Inc, Stripe, salary…"
                maxLength={80}
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
              />
            </Field>
            {isBusiness ? (
              <Field label="Counts toward MRR?">
                <Select
                  value={revenueType}
                  onChange={(e) => setRevenueType(e.target.value as RevenueType | "")}
                  aria-describedby="recurring-mrr-hint"
                >
                  <option value="">No, not recurring revenue</option>
                  <option value="subscription">Yes, subscription</option>
                  <option value="retainer">Yes, retainer</option>
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}
        {kind === "income" && isBusiness ? (
          <p id="recurring-mrr-hint" className="-mt-2 text-[12px] text-[color:var(--color-ink-3)]">
            Only contracted subscriptions and retainers count. One-off work, loans, transfers and investment proceeds never do.
          </p>
        ) : null}
        <Field label="Notes (optional)">
          <TextInput
            placeholder="Anything you'd like to remember"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-[color:var(--color-ink-2)] cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--color-brand)]"
          />
          Active — auto-generate transactions
        </label>
        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <DialogFooter
          canDelete={Boolean(editing)}
          onDelete={handleDelete}
          confirmDelete={confirmDelete}
          onClose={onClose}
          submitLabel={editing ? "Save changes" : "Add recurring"}
          submitIcon={<Repeat size={14} />}
        />
      </form>
    </Dialog>
  );
}
