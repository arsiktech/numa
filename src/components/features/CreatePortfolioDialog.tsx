import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cloud, UserRound, Users, UsersRound } from "lucide-react";
import { Dialog, Field, Select, TextInput } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Sparkle } from "@/components/ui/Sparkle";
import { usePortfolios } from "@/services/store";
import { useAuth } from "@/services/auth";
import { cn } from "@/lib/cn";
import { useDomainActions } from "@/services/domainActions";
import type { CurrencyCode, PortfolioType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPES: { value: PortfolioType; label: string; description: string; icon: typeof UserRound }[] = [
  { value: "personal", label: "Personal", description: "Just for you", icon: UserRound },
  { value: "shared", label: "Shared", description: "You + one collaborator", icon: UsersRound },
  { value: "family", label: "Family", description: "Three or more members", icon: Users }
];

export function CreatePortfolioDialog(props: Props) {
  return <CreatePortfolioDialogBase {...props} />;
}

function CreatePortfolioDialogBase({ open, onClose }: Props) {
  const portfolios = usePortfolios();
  const navigate = useNavigate();
  const { currentAccount } = useAuth();
  const actions = useDomainActions();
  const isCloudSignedIn = !!currentAccount?.isCloud;

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [type, setType] = useState<PortfolioType>("personal");
  const [currency, setCurrency] = useState<CurrencyCode>(
    portfolios[0]?.defaultCurrency ?? "EUR"
  );
  const [seedDefaults, setSeedDefaults] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const willGoCloud = isCloudSignedIn;

  useEffect(() => {
    if (!open) return;
    setName("");
    setTagline("");
    setType("personal");
    setCurrency(portfolios[0]?.defaultCurrency ?? "EUR");
    setSeedDefaults(true);
    setError(null);
    setSubmitting(false);
  }, [open, portfolios]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      // Convex schema still narrows the on-disk currency to USD|EUR. We narrow
      // before sending; falling back to EUR keeps cloud portfolios always-EUR
      // until the schema migration widens the enum.
      const cloudCurrency: "USD" | "EUR" = currency === "USD" ? "USD" : "EUR";
      await actions.createPortfolio({
        name: trimmed,
        type,
        tagline: tagline.trim() || defaultTagline(type),
        defaultCurrency: willGoCloud ? cloudCurrency : currency,
        seedDefaults
      });
      onClose();
      if (type === "shared" || type === "family") navigate("/pod");
    } catch (e) {
      setError((e as Error).message || "Failed to create portfolio.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New portfolio" description="Group transactions by life context — personal, shared with one person, or a whole household.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <TextInput
            placeholder="e.g. Personal, Shared Loft, Family"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <div>
          <p className="text-[12px] font-medium text-[color:var(--color-ink-3)] uppercase tracking-[0.06em] mb-2">
            Type
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left transition-colors",
                    active
                      ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand-mist)]"
                      : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] hover:bg-[color:var(--color-cream-50)]"
                  )}
                >
                  <span
                    className={cn(
                      "grid place-items-center w-8 h-8 rounded-xl mb-2",
                      active
                        ? "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]"
                        : "bg-[color:var(--color-surface-lavender)] text-[color:var(--color-brand-strong)]"
                    )}
                  >
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  <p className="text-[13px] font-semibold text-[color:var(--color-ink)]">{t.label}</p>
                  <p className="text-[11px] text-[color:var(--color-ink-3)] leading-tight">{t.description}</p>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tagline (optional)">
            <TextInput
              placeholder={defaultTagline(type)}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </Field>
          <Field
            label="Default currency"
            hint="Cross-currency rollups convert into this. Per-entry currency on transactions/assets supports more options."
          >
            {/* Restricted to USD|EUR because the Convex schema only stores those for
                portfolio.defaultCurrency. Per-entry currency (transactions, assets,
                liabilities, etc.) supports the wider set client-side. */}
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
              <option value="EUR">EUR — euro</option>
              <option value="USD">USD — US dollar</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] px-3 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={seedDefaults}
            onChange={(e) => setSeedDefaults(e.target.checked)}
            className="mt-0.5 accent-[color:var(--color-brand)]"
          />
          <span className="text-[12.5px] text-[color:var(--color-ink-2)]">
            <span className="font-semibold text-[color:var(--color-ink)] block">
              Seed with starter categories and a Cash account
            </span>
            Pre-creates Groceries / Dining / Transport / Rent / Utilities / Subscriptions / Salary / Freelance, plus a Cash account so transactions have somewhere to land.
          </span>
        </label>
        {willGoCloud ? (
          <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--color-brand-strong)] bg-[color:var(--color-brand-mist)] border border-[color:var(--color-brand-soft)] px-3 py-2 rounded-xl">
            <Cloud size={13} />
            Cloud portfolio — collaborators will see this in real time.
          </p>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            <Sparkle size={14} />
            {submitting ? "Creating…" : "Create portfolio"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function defaultTagline(type: PortfolioType) {
  if (type === "shared") return "Two-person split";
  if (type === "family") return "Household ledger";
  return "Just you";
}
