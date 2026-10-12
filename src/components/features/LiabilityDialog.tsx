import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { Dialog, Field, Select, TextInput } from "@/components/ui/Dialog";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { DialogFooter, useConfirmDelete } from "@/components/ui/DialogFooter";
import { useCurrentPortfolioId, usePortfolio } from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useUndo } from "@/services/undo";
import type { CurrencyCode, Liability, LiabilityKind } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Liability | null;
  defaultKind?: LiabilityKind;
  defaultName?: string;
  defaultNotes?: string;
}

const KINDS: { value: LiabilityKind; label: string }[] = [
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "other", label: "Other debt" }
];

export function LiabilityDialog({
  open,
  onClose,
  editing,
  defaultKind = "credit_card",
  defaultName = "",
  defaultNotes = ""
}: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const actions = useDomainActions();
  const { push: pushUndo } = useUndo();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LiabilityKind>("credit_card");
  const [balance, setBalance] = useState("0");
  const [currency, setCurrency] = useState<CurrencyCode>(portfolio.defaultCurrency);
  const [interestRate, setInterestRate] = useState("");
  const [dueDate, setDueDate] = useState("");
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
      setInterestRate(editing.interestRate?.toString() ?? "");
      setDueDate(
        editing.dueDate ? new Date(editing.dueDate).toISOString().slice(0, 10) : ""
      );
      setNotes(editing.notes ?? "");
    } else {
      setName(defaultName);
      setKind(defaultKind);
      setBalance("0");
      setCurrency(portfolio.defaultCurrency);
      setInterestRate("");
      setDueDate("");
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
    if (!Number.isFinite(numericBalance) || numericBalance < 0) {
      setError("Balance must be a non-negative number.");
      return;
    }
    const numericInterest = interestRate ? Number(interestRate) : undefined;
    const dueTimestamp = dueDate ? new Date(dueDate).getTime() : undefined;

    if (editing) {
      await actions.updateLiability(editing.id, {
        name: trimmed,
        kind,
        balance: numericBalance,
        currency,
        interestRate: numericInterest,
        dueDate: dueTimestamp,
        notes: notes.trim() || undefined
      });
      onClose();
      return;
    }
    await actions.createLiability({
      portfolioId,
      name: trimmed,
      kind,
      balance: numericBalance,
      currency,
      interestRate: numericInterest,
      dueDate: dueTimestamp,
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
    // Cloud caveat: on cloud portfolios the bridge re-routes addLiability as a
    // fresh insert and Convex generates a new id.
    const snapshot: Liability = { ...editing };
    await actions.deleteLiability(editing.id, editing.portfolioId);
    pushUndo({
      message: `Liability "${snapshot.name}" deleted`,
      onUndo: () => {
        void actions.createLiability(snapshot);
      }
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit liability" : "New liability"}
      description="Mortgages, credit cards, loans — anything that subtracts from net worth."
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Name">
          <TextInput
            placeholder="Amex Gold, BBVA mortgage, Student loan…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as LiabilityKind)}>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Balance owed">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </Field>
          <Field label="APR % (optional)">
            <TextInput
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Next due date (optional)">
          <TextInput
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)">
          <TextInput
            placeholder="Provider, account number, anything"
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
          submitLabel={editing ? "Save changes" : "Add liability"}
          submitIcon={<CreditCard size={14} />}
        />
      </form>
    </Dialog>
  );
}
