import { useEffect, useState } from "react";
import { Dialog, Field, TextInput } from "@/components/ui/Dialog";
import { DialogFooter, useConfirmDelete } from "@/components/ui/DialogFooter";
import { Segmented } from "@/components/ui/Segmented";
import { CategoryIcon, tonesFor } from "@/components/features/CategoryIcon";
import { useCategories, useCurrentPortfolioId, usePortfolio } from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useUndo } from "@/services/undo";
import { cn } from "@/lib/cn";
import type { Category, CategoryKind } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
  defaultKind?: CategoryKind;
}

const ICON_OPTIONS = [
  "shopping-basket",
  "shopping-cart",
  "shopping-bag",
  "utensils",
  "wine",
  "car",
  "plane",
  "home",
  "zap",
  "repeat",
  "heart-pulse",
  "film",
  "graduation-cap",
  "piggy-bank",
  "sparkles",
  "briefcase",
  "hand-coins",
  "landmark",
  "credit-card",
  "line-chart",
  "layers"
] as const;

const COLOR_OPTIONS = ["mint", "peach", "lavender", "sky", "blush", "sand"] as const;

const EMOJI_SUGGESTIONS = [
  "",
  "🥑",
  "🍔",
  "☕",
  "🍷",
  "🛒",
  "🚗",
  "🚆",
  "✈️",
  "🏠",
  "💡",
  "📱",
  "🎬",
  "🎮",
  "📚",
  "🩺",
  "💊",
  "🐾",
  "💼",
  "💰",
  "🪙",
  "📈",
  "🎁",
  "🌱"
] as const;

export function CategoryDialog({ open, onClose, editing, defaultKind = "expense" }: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const allCategories = useCategories(portfolioId);
  const portfolio = usePortfolio(portfolioId);
  const actions = useDomainActions();
  const { push: pushUndo } = useUndo();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>(defaultKind);
  const [icon, setIcon] = useState<string>("shopping-basket");
  const [color, setColor] = useState<string>("mint");
  const [emoji, setEmoji] = useState<string>("");
  const [monthlyLimit, setMonthlyLimit] = useState<string>("");
  const { confirmDelete, arm: armDelete, disarm } = useConfirmDelete();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    disarm();
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setIcon(editing.icon);
      setColor(editing.color);
      setEmoji(editing.emoji ?? "");
      setMonthlyLimit(editing.monthlyLimit?.toString() ?? "");
    } else {
      setName("");
      setKind(defaultKind);
      setIcon("shopping-basket");
      setColor("mint");
      setEmoji("");
      setMonthlyLimit("");
    }
  }, [disarm, open, editing, defaultKind]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const duplicate = allCategories.some(
      (category) =>
        category.id !== editing?.id &&
        category.kind === kind &&
        category.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setError(`${trimmed} already exists in ${kind}.`);
      return;
    }
    const limit = monthlyLimit ? Number(monthlyLimit) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
      setError("Monthly limit must be a positive number.");
      return;
    }
    if (editing) {
      await actions.updateCategory(editing.id, {
        name: trimmed,
        kind,
        icon,
        color,
        emoji: emoji || undefined,
        monthlyLimit: limit
      });
      onClose();
      return;
    }
    const sortOrder = allCategories.length;
    await actions.createCategory({
      portfolioId,
      name: trimmed,
      kind,
      icon,
      color,
      sortOrder,
      emoji: emoji || undefined,
      monthlyLimit: limit
    });
    onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      armDelete();
      return;
    }
    // Note: deleteCategory nulls out categoryId on any linked transactions.
    // Re-adding the category does NOT restore those links — we'd need a
    // separate snapshot of affected transactions for that. Acceptable trade-off
    // for the simple undo UX. Cloud caveat: on cloud portfolios, Convex mints
    // a fresh id when addCategory routes through the bridge.
    const snapshot: Category = { ...editing };
    await actions.deleteCategory(editing.id, editing.portfolioId);
    pushUndo({
      message: `Category "${snapshot.name}" deleted`,
      onUndo: () => {
        void actions.createCategory(snapshot);
      }
    });
    onClose();
  }

  const tone = tonesFor(color);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit category" : "New category"}
      description={editing ? "Rename, repaint, or remove" : "Used to bucket your transactions"}
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Segmented
          value={kind}
          onChange={(next) => setKind(next as CategoryKind)}
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" }
          ]}
        />
        <div className="flex items-center gap-3">
          <span
            className="grid place-items-center w-12 h-12 rounded-2xl shrink-0 relative"
            style={{ background: tone.surface, color: tone.ink }}
          >
            <CategoryIcon name={icon} size={20} />
            {emoji ? (
              <span className="absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-[color:var(--color-paper)] shadow text-[14px] leading-none">
                {emoji}
              </span>
            ) : null}
          </span>
          <div className="flex-1">
            <Field label="Name">
              <TextInput
                placeholder="Dining, Salary, Subscriptions…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </Field>
          </div>
        </div>
        <Field label="Icon">
          <div className="grid grid-cols-7 gap-1.5">
            {ICON_OPTIONS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setIcon(name)}
                className={cn(
                  "grid place-items-center w-9 h-9 rounded-xl border transition-colors",
                  icon === name
                    ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand-mist)] text-[color:var(--color-brand-strong)]"
                    : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                )}
              >
                <CategoryIcon name={name} size={15} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color">
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((c) => {
              const t = tonesFor(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    color === c
                      ? "border-[color:var(--color-ink)] scale-110"
                      : "border-transparent"
                  )}
                  style={{ background: t.surface }}
                />
              );
            })}
          </div>
        </Field>
        <Field label="Emoji (optional)" hint="A small flair shown next to the icon">
          <div className="grid grid-cols-12 gap-1.5">
            {EMOJI_SUGGESTIONS.map((e, idx) => (
              <button
                key={`${e || "none"}-${idx}`}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  "grid place-items-center w-8 h-8 rounded-lg border text-[16px] transition-colors",
                  emoji === e
                    ? "border-[color:var(--color-brand)] bg-[color:var(--color-brand-mist)]"
                    : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] hover:bg-[color:var(--color-cream-100)]"
                )}
              >
                {e || (
                  <span className="text-[color:var(--color-ink-4)] text-[12px]">—</span>
                )}
              </button>
            ))}
          </div>
        </Field>
        {kind === "expense" ? (
          <Field
            label={`Monthly limit (${editing?.monthlyLimitCurrency ?? portfolio.defaultCurrency}, optional)`}
            hint="Set a soft cap. We'll show a progress bar on the category card."
          >
            <TextInput
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 250"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
            />
          </Field>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <DialogFooter
          canDelete={Boolean(editing)}
          onDelete={handleDelete}
          confirmDelete={confirmDelete}
          onClose={onClose}
          submitLabel={editing ? "Save changes" : "Create category"}
        />
      </form>
    </Dialog>
  );
}
