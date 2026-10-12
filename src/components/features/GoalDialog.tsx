import { useEffect, useMemo, useRef, useState } from "react";
import { Target } from "lucide-react";
import { Dialog, Field, Select, TextInput } from "@/components/ui/Dialog";
import { DialogFooter, useConfirmDelete } from "@/components/ui/DialogFooter";
import { newId } from "@/lib/ids";
import {
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  useHoldings,
  usePortfolio
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import type { GoalScope, NetWorthGoal } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: NetWorthGoal | null;
  initialMode?: GoalMode;
}

type GoalMode = "net_worth" | "monthly_income" | "income_category" | "asset_or_holding";

function toDateInput(ts?: number) {
  return ts ? new Date(ts).toISOString().slice(0, 10) : "";
}

function modeFor(goal?: NetWorthGoal | null): GoalMode {
  if (!goal) return "net_worth";
  if (goal.scope === "monthly_income") return "monthly_income";
  if (goal.scope === "income_category") return "income_category";
  if (goal.scope === "asset_value" || goal.scope === "holding_value") return "asset_or_holding";
  return "net_worth";
}

export function GoalDialog(props: Props) {
  return <GoalDialogInner {...props} />;
}

function GoalDialogInner({
  open,
  onClose,
  editing = null,
  initialMode
}: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const categories = useCategories(portfolio.id);
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.kind === "income"),
    [categories]
  );
  const assets = useAssets(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const actions = useDomainActions();

  const [mode, setMode] = useState<GoalMode>("net_worth");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [deadline, setDeadline] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [assetTarget, setAssetTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, arm: armDelete, disarm } = useConfirmDelete();
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<{ open: boolean; key: string | null }>({ open: false, key: null });

  const assetOptions = useMemo(
    () => [
      ...assets.map((asset) => ({ value: `asset:${asset.id}`, label: `Asset · ${asset.name}` })),
      ...holdings.map((holding) => ({
        value: `holding:${holding.id}`,
        label: `Holding · ${holding.name} (${holding.symbol})`
      }))
    ],
    [assets, holdings]
  );
  const firstIncomeCategoryId = incomeCategories[0]?.id ?? "";
  const firstAssetTarget = assetOptions[0]?.value ?? "";

  useEffect(() => {
    if (!open) {
      sessionRef.current = { open: false, key: null };
      return;
    }

    const sessionKey = editing?.id ?? `new:${initialMode ?? "net_worth"}`;
    const shouldReset = !sessionRef.current.open || sessionRef.current.key !== sessionKey;
    const nextAssetTarget = editing?.assetId
      ? `asset:${editing.assetId}`
      : editing?.holdingId
        ? `holding:${editing.holdingId}`
        : firstAssetTarget;

    if (shouldReset) {
      sessionRef.current = { open: true, key: sessionKey };
      setError(null);
      disarm();
      setBusy(false);
      setMode(editing ? modeFor(editing) : initialMode ?? "net_worth");
      setTarget(editing?.target.toString() ?? "");
      setLabel(editing?.label ?? "");
      setDeadline(toDateInput(editing?.deadline));
      setCategoryId(editing?.categoryId ?? firstIncomeCategoryId);
      setAssetTarget(nextAssetTarget);
      setNewCategory("");
      return;
    }

    setCategoryId((current) => current || editing?.categoryId || firstIncomeCategoryId);
    setAssetTarget((current) => current || nextAssetTarget);
  }, [disarm, open, editing, initialMode, firstIncomeCategoryId, firstAssetTarget]);

  async function ensureCategoryId() {
    if (mode !== "income_category") return undefined;
    if (newCategory.trim()) {
      const name = newCategory.trim();
      const result = await actions.createCategory({
        portfolioId: portfolio.id,
        name,
        kind: "income",
        icon: "sparkles",
        color: "mint",
        sortOrder: categories.length,
        emoji: "✨"
      });
      return result.id;
    }
    return categoryId || undefined;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const numericTarget = Number(target);
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError("Target must be a positive number.");
      return;
    }
    const deadlineTs = deadline ? new Date(deadline).getTime() : undefined;
    if (deadlineTs && deadlineTs < Date.now() - 1000 * 60 * 60 * 24) {
      setError("Deadline can't be in the past.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let scope: GoalScope = "net_worth";
      let selectedCategoryId: string | undefined;
      let assetId: string | undefined;
      let holdingId: string | undefined;

      if (mode === "monthly_income") {
        scope = "monthly_income";
      }

      if (mode === "income_category") {
        scope = "income_category";
        selectedCategoryId = await ensureCategoryId();
        if (!selectedCategoryId) {
          setError("Choose or create an income category.");
          return;
        }
      }

      if (mode === "asset_or_holding") {
        const [kind, id] = assetTarget.split(":");
        if (!kind || !id) {
          setError("Choose an asset or holding.");
          return;
        }
        if (kind === "asset") {
          scope = "asset_value";
          assetId = id;
        } else {
          scope = "holding_value";
          holdingId = id;
        }
      }

      const now = Date.now();
      await actions.upsertGoal({
        id: editing?.id ?? newId("goal"),
        portfolioId: portfolio.id,
        scope,
        target: numericTarget,
        currency: portfolio.defaultCurrency,
        startAt: editing?.startAt ?? now,
        deadline: deadlineTs,
        label: label.trim() || undefined,
        categoryId: selectedCategoryId,
        assetId,
        holdingId,
        createdAt: editing?.createdAt ?? now
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save goal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      armDelete();
      return;
    }
    await actions.deleteGoal(editing.id, editing.portfolioId);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit goal" : "New goal"}
      description="Track net worth, monthly income, category income, or a specific asset/holding value."
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[color:var(--color-cream-50)] p-1 sm:grid-cols-4">
          {[
            ["net_worth", "Net worth"],
            ["monthly_income", "Monthly"],
            ["income_category", "Income"],
            ["asset_or_holding", "Asset"]
          ].map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value as GoalMode)}
              className={`h-9 rounded-xl text-[12.5px] font-semibold transition-colors ${
                mode === value
                  ? "bg-[color:var(--color-paper)] text-[color:var(--color-ink)] shadow-[var(--shadow-sm)]"
                  : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <Field label="Goal name (optional)">
          <TextInput
            placeholder={
              mode === "monthly_income"
                ? "MRR target"
                : mode === "income_category"
                ? "AI agents revenue"
                : mode === "asset_or_holding"
                  ? "Brokerage to 50k"
                  : "House down-payment"
            }
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </Field>

        {mode === "income_category" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Income category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Choose category</option>
                {incomeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Or create">
              <TextInput
                placeholder="AI agents"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {mode === "asset_or_holding" ? (
          <Field label="Asset or holding">
            <Select value={assetTarget} onChange={(e) => setAssetTarget(e.target.value)}>
              <option value="">Choose target</option>
              {assetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label={`Target (${portfolio.defaultCurrency})`}>
          <TextInput
            type="number"
            step="100"
            min="0"
            placeholder={mode === "monthly_income" ? "50000" : mode === "income_category" ? "7000" : "250000"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
        </Field>

        <Field label="Deadline (optional)" hint="Used to estimate whether you're on pace">
          <TextInput
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>

        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}

        <DialogFooter
          canDelete={Boolean(editing)}
          onDelete={handleDelete}
          confirmDelete={confirmDelete}
          deleteLabel="Delete goal"
          onClose={onClose}
          submitLabel={busy ? "Saving…" : editing ? "Save changes" : "Set goal"}
          submitIcon={<Target size={14} />}
          busy={busy}
        />
      </form>
    </Dialog>
  );
}
