import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { format } from "date-fns";
import { Dialog, Field, TextInput, Select } from "@/components/ui/Dialog";
import { DialogFooter, useConfirmDelete } from "@/components/ui/DialogFooter";
import { Segmented } from "@/components/ui/Segmented";
import {
  useAssets,
  useCategories,
  useCurrentUser,
  useMemberships,
  usePortfolio
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useUndo } from "@/services/undo";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/money";
import { getCurrentPosition, reverseGeocode, type GeoError } from "@/lib/geocode";
import { useAppMode } from "@/lib/appMode";
import { occurredAtFromIsoDate } from "@/lib/occurredAt";
import type { CurrencyCode, Transaction } from "@/lib/types";

type Kind = "income" | "expense";

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
}

export function EditTransactionDialog({ transaction, onClose }: Props) {
  const portfolio = usePortfolio(transaction?.portfolioId);
  const categories = useCategories(transaction?.portfolioId ?? "");
  const memberships = useMemberships(transaction?.portfolioId ?? "");
  const allAssets = useAssets(transaction?.portfolioId ?? "");
  const cashAccounts = allAssets.filter((a) => a.kind === "cash");
  const me = useCurrentUser();
  const actions = useDomainActions();
  const { push: pushUndo } = useUndo();
  const [appMode] = useAppMode();
  // Light mode hides currency / from-account / paidBy / location pickers and
  // preserves whatever was saved. If a tx has those values, they stay; the
  // user just doesn't see the controls.
  const isLight = appMode === "light";

  const [kind, setKind] = useState<Kind>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("EUR");
  const [categoryId, setCategoryId] = useState<string>("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState("");
  const { confirmDelete, arm: armDelete, disarm } = useConfirmDelete();
  const [location, setLocation] = useState<
    { lat: number; lng: number; label?: string } | null
  >(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction) return;
    setKind(transaction.kind);
    setDescription(transaction.description);
    setAmount(transaction.amount.toString());
    setCurrency(transaction.currency);
    setCategoryId(transaction.categoryId ?? "");
    setPaidBy(transaction.createdByUserId);
    setAccountId(transaction.accountId ?? "");
    setOccurredAt(format(new Date(transaction.occurredAt), "yyyy-MM-dd"));
    disarm();
    setLocation(transaction.location ?? null);
    setGeoError(null);
  }, [disarm, transaction]);

  async function captureLocation() {
    setGeoBusy(true);
    setGeoError(null);
    try {
      const coords = await getCurrentPosition();
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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!transaction) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !description.trim()) return;
    await actions.updateTransaction(transaction.id, {
      occurredAt: occurredAtFromIsoDate(occurredAt),
      description: description.trim(),
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
      kind,
      amount: numericAmount,
      currency,
      createdByUserId: isShared ? paidBy : transaction.createdByUserId,
      location: location ?? undefined
    });
    onClose();
  }

  async function handleDelete() {
    if (!transaction) return;
    if (!confirmDelete) {
      armDelete();
      return;
    }
    // Snapshot before delete so the undo toast can restore. For cloud-backed
    // portfolios the bridge will re-dispatch this as a fresh insert and Convex
    // will mint a new id — that's the right trade-off for undo UX.
    const snapshot: Transaction = { ...transaction };
    await actions.deleteTransaction(transaction.id, transaction.portfolioId);
    pushUndo({
      message: "Transaction deleted",
      onUndo: () => {
        void actions.createTransaction(snapshot);
      }
    });
    onClose();
  }

  return (
    <Dialog
      open={transaction !== null}
      onClose={onClose}
      title="Edit transaction"
      description={`In ${portfolio.name}`}
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Segmented
          value={kind}
          onChange={(next) => {
            setKind(next);
            setCategoryId(categories.find((c) => c.kind === next)?.id ?? "");
          }}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" }
          ]}
        />
        <Field label="Description">
          <TextInput
            placeholder="Mercadona, salary, Spotify…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>
        </div>
        {isLight ? null : (
          <Field
            label="Currency"
            hint={
              currency === portfolio.defaultCurrency
                ? undefined
                : `Will be converted to ${portfolio.defaultCurrency} in totals via ECB rates.`
            }
          >
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorised</option>
            {visibleCats.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        {!isLight && cashAccounts.length > 0 ? (
          <Field label="From account" hint="Balance moves with the transaction">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">No account</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance, a.currency)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {!isLight && isShared ? (
          <Field
            label="Paid by"
            hint="Changing the payer reshuffles who's owed in the Shared view"
          >
            <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                  {m.userId === me.id ? " (you)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {isLight ? null : (
          <div>
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
        )}
        <DialogFooter
          onDelete={handleDelete}
          confirmDelete={confirmDelete}
          onClose={onClose}
          submitLabel={"Save changes"}
        />
      </form>
    </Dialog>
  );
}
