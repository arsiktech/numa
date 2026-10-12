import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Dialog, Field, Select, TextInput } from "@/components/ui/Dialog";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { DialogFooter, useConfirmDelete } from "@/components/ui/DialogFooter";
import { useCurrentPortfolioId, usePortfolio } from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useUndo } from "@/services/undo";
import type { Asset, AssetKind, CurrencyCode } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Asset | null;
  defaultKind?: AssetKind;
  defaultName?: string;
  defaultNotes?: string;
}

const KINDS: { value: AssetKind; label: string }[] = [
  { value: "cash", label: "Cash / Bank account" },
  { value: "real_estate", label: "Real estate" },
  { value: "vehicle", label: "Vehicle" },
  { value: "collectible", label: "Collectible" },
  { value: "other", label: "Other asset" }
];

export function AssetDialog({
  open,
  onClose,
  editing,
  defaultKind = "cash",
  defaultName = "",
  defaultNotes = ""
}: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const actions = useDomainActions();
  const { push: pushUndo } = useUndo();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>(defaultKind);
  const [balance, setBalance] = useState("0");
  const [currency, setCurrency] = useState<CurrencyCode>(portfolio.defaultCurrency);
  const [notes, setNotes] = useState("");
  const { confirmDelete, arm: armDelete, disarm } = useConfirmDelete();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    disarm();
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setBalance(editing.balance.toString());
      setCurrency(editing.currency);
      setNotes(editing.notes ?? "");
    } else {
      setName(defaultName);
      setKind(defaultKind);
      setBalance("0");
      setCurrency(portfolio.defaultCurrency);
      setNotes(defaultNotes);
    }
  }, [disarm, open, editing, portfolio.defaultCurrency, defaultKind, defaultName, defaultNotes]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const numericBalance = Number(balance);
    if (!Number.isFinite(numericBalance)) {
      setError("Balance must be a number.");
      return;
    }
    if (editing) {
      await actions.updateAsset(editing.id, {
        name: trimmed,
        kind,
        balance: numericBalance,
        currency,
        notes: notes.trim() || undefined
      });
      onClose();
      return;
    }
    await actions.createAsset({
      portfolioId,
      name: trimmed,
      kind,
      balance: numericBalance,
      currency,
      notes: notes.trim() || undefined
    });
    onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      armDelete();
      return;
    }
    // Cloud caveat: when re-dispatched on a cloud portfolio, Convex will mint
    // a fresh id. The user gets the asset back; the id swaps.
    const snapshot: Asset = { ...editing };
    await actions.deleteAsset(editing.id, editing.portfolioId);
    pushUndo({
      message: `Asset "${snapshot.name}" deleted`,
      onUndo: () => {
        void actions.createAsset(snapshot);
      }
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit asset" : "New asset"}
      description={
        editing
          ? "Cash accounts power the From-account picker on transactions."
          : "Add a bank, savings, real estate, or any other thing you own."
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Name">
          <TextInput
            placeholder="ZEN.COM, BBVA checking, Apartment, Vespa…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Field>
        </div>
        <Field
          label={kind === "cash" ? "Balance" : "Estimated value"}
          hint={
            kind === "cash"
              ? "Adjusted automatically when linked transactions are added or edited."
              : "What it's worth right now."
          }
        >
          <TextInput
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)">
          <TextInput
            placeholder="IBAN last 4, broker name, anything"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <DialogFooter
          canDelete={Boolean(editing)}
          onDelete={handleDelete}
          confirmDelete={confirmDelete}
          onClose={onClose}
          submitLabel={editing ? "Save changes" : "Add asset"}
          submitIcon={<Wallet size={14} />}
        />
      </form>
    </Dialog>
  );
}
