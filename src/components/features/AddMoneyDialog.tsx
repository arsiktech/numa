import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, Field, TextInput } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  useAssets,
  useCurrentPortfolioId,
  useCurrentUser,
  usePortfolio
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useFxRates } from "@/services/fxSync";
import { goalScope } from "@/lib/goals";
import { convertCurrency } from "@/lib/fx";
import { useLocale } from "@/lib/i18n";
import { template } from "@/lib/podPageHelpers";
import { formatMoneyDecimal } from "@/lib/money";
import type { NetWorthGoal } from "@/lib/types";

/**
 * "Add money" / "Add contribution" to a goal — shared by the Simple-mode
 * Buckets page and the Advanced Goals page. Routed by goal scope through the
 * services-layer actions (never logged as an expense):
 *   - asset_value      → updateAsset (raise the linked asset's balance)
 *   - monthly_income   → createTransaction kind "income" without forcing a category
 *   - income_category  → createTransaction kind "income" in the goal category
 *   - net_worth        → updateAsset on the first cash asset (or createAsset
 *     a "Savings" cash account)
 *   - holding_value    → read-only (progress follows market price)
 */
export function AddMoneyDialog({
  open,
  goal,
  label,
  onClose,
  onCelebrate
}: {
  open: boolean;
  goal: NetWorthGoal | null;
  label: string;
  onClose: () => void;
  /** Fired on a successful contribution so the parent can run a brand flourish. */
  onCelebrate?: (message: string) => void;
}) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const assets = useAssets(portfolio.id);
  const { rates } = useFxRates();
  const actions = useDomainActions();
  const { t } = useLocale();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setBusy(false);
    setError(null);
  }, [open]);

  if (!open || !goal) return null;

  const scope = goalScope(goal);
  const numericAmount = Number(amount);
  const amountTooLarge = Number.isFinite(numericAmount) && numericAmount > MAX_CONTRIBUTION;
  const canSave =
    Number.isFinite(numericAmount) && numericAmount > 0 && !amountTooLarge && !busy;
  const linkedAsset =
    scope === "asset_value" ? assets.find((asset) => asset.id === goal.assetId) : undefined;
  const cashAsset = scope === "net_worth" ? assets.find((asset) => asset.kind === "cash") : undefined;
  const destinationHint =
    scope === "asset_value"
      ? linkedAsset
        ? template(t("goal.hintAsset"), { name: linkedAsset.name })
        : t("goal.hintAssetMissing")
      : scope === "income_category"
        ? t("goal.hintIncome")
        : scope === "monthly_income"
          ? "Creates an income movement that counts toward this month's pace."
        : cashAsset
          ? template(t("goal.hintCash"), { name: cashAsset.name })
          : t("goal.hintNewCash");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || !goal) return;
    setBusy(true);
    setError(null);
    try {
      if (scope === "asset_value") {
        if (!linkedAsset) throw new Error(t("goal.errorAssetMissing"));
        const delta = convertCurrency(numericAmount, goal.currency, linkedAsset.currency, rates);
        if (!Number.isFinite(delta)) throw new Error("A verified exchange rate is required before adding this money.");
        await actions.adjustAssetBalance(linkedAsset.id, delta, linkedAsset.portfolioId);
      } else if (scope === "income_category" && goal.categoryId) {
        await actions.createTransaction({
          portfolioId: portfolio.id,
          occurredAt: Date.now(),
          description: template(t("goal.addedDescription"), { label }),
          categoryId: goal.categoryId,
          kind: "income",
          amount: numericAmount,
          currency: goal.currency,
          createdByUserId: me.id
        });
      } else if (scope === "monthly_income") {
        await actions.createTransaction({
          portfolioId: portfolio.id,
          occurredAt: Date.now(),
          description: template(t("goal.addedDescription"), { label }),
          kind: "income",
          amount: numericAmount,
          currency: goal.currency,
          createdByUserId: me.id
        });
      } else if (cashAsset) {
        const delta = convertCurrency(numericAmount, goal.currency, cashAsset.currency, rates);
        if (!Number.isFinite(delta)) throw new Error("A verified exchange rate is required before adding this money.");
        await actions.adjustAssetBalance(cashAsset.id, delta, cashAsset.portfolioId);
      } else {
        await actions.createAsset({
          portfolioId: portfolio.id,
          name: t("goal.savingsName"),
          kind: "cash",
          balance: numericAmount,
          currency: goal.currency
        });
      }
      onCelebrate?.(`+ ${formatMoneyDecimal(numericAmount, goal.currency)}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("goal.errorGeneric"));
      setBusy(false);
    }
  }

  if (scope === "holding_value") {
    return (
      <Dialog open={open} onClose={onClose} title={template(t("goal.addTo"), { label })}>
        <p className="text-[13.5px] leading-relaxed text-[color:var(--color-ink-2)]">
          {t("goal.holdingExplain")}
        </p>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="primary" onClick={onClose}>
            {t("goal.gotIt")}
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={template(t("goal.addTo"), { label })}
      description={destinationHint}
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label={template(t("goal.amountLabel"), { currency: goal.currency })}>
          <TextInput
            inputMode="decimal"
            placeholder="50"
            value={amount}
            onChange={(event) => setAmount(cleanAmountInput(event.target.value))}
            autoFocus
            aria-label={t("goal.amountAria")}
          />
        </Field>
        {amountTooLarge ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]" role="alert">
            {template(t("goal.tooLarge"), {
              max: formatMoneyDecimal(MAX_CONTRIBUTION, goal.currency)
            })}
          </p>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("goal.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
            <Plus size={14} />
            {busy
              ? t("goal.adding")
              : template(t("goal.addCta"), {
                  amount: formatMoneyDecimal(Math.max(0, numericAmount || 0), goal.currency)
                })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Largest contribution accepted in one add: 13 whole digits. Anything above
 * shows a visible validation error (submit disabled) instead of the old
 * silent 7-digit truncation. Well below Number.MAX_SAFE_INTEGER (~9e15), so
 * arithmetic on balances stays exact.
 */
export const MAX_CONTRIBUTION = 9_999_999_999_999;

/**
 * Decimal-input cleaner with European comma support: "12,50" → "12.50",
 * "1.234,56" → "1234.56", "1,234.56" → "1234.56", plain "12.50" unchanged.
 * Whole digits are only clipped at 15 (a Number-precision guard, past the
 * 13-digit MAX_CONTRIBUTION limit) so oversized input surfaces the visible
 * validation error rather than being silently shrunk.
 */
export function cleanAmountInput(value: string) {
  let normalized = value;
  const lastComma = normalized.lastIndexOf(",");
  if (lastComma !== -1) {
    if (lastComma > normalized.lastIndexOf(".")) {
      normalized = `${normalized.slice(0, lastComma).replace(/[.,]/g, "")}.${normalized.slice(lastComma + 1)}`;
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }
  const stripped = normalized.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = stripped.split(".");
  const decimals = rest.join("").slice(0, 2);
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "").slice(0, 15) || "0";
  return rest.length ? `${normalizedWhole}.${decimals}` : normalizedWhole;
}
