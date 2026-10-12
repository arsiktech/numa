import type { Category, RecurringTransaction } from "@/lib/types";
import { formatMoneyDecimal } from "@/lib/money";
import { cn } from "@/lib/cn";
import { cadenceLabel } from "./shared";

/** Recurring rules as plain rows: what, how often, next date, amount. */
export function RecurringSection({
  recurring,
  categories,
  onEdit,
  onAdd
}: {
  recurring: RecurringTransaction[];
  categories: Category[];
  onEdit: (recurring: RecurringTransaction) => void;
  onAdd: () => void;
}) {
  return (
    <section aria-labelledby="recurring-rules">
      <h2 id="recurring-rules" className="border-b border-[color:var(--color-ink)] pb-2 text-[17px] font-semibold">
        Repeating income and bills
      </h2>
      {recurring.length === 0 ? (
        <p className="mt-3 max-w-[52ch] text-[15px] text-[color:var(--color-ink-3)]">
          Add salary, rent or subscriptions that repeat. Numa Pro records each one on its date.
        </p>
      ) : (
        <ul>
          {recurring.map((rule) => {
            const category = categories.find((c) => c.id === rule.categoryId);
            const when = rule.active
              ? `next ${new Date(rule.nextRunAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
              : "paused";
            return (
              <li key={rule.id}>
                <button
                  type="button"
                  onClick={() => onEdit(rule)}
                  className="nm-balance-row nm-balance-row-button"
                  aria-label={`${rule.description}, ${cadenceLabel(rule.cadence)}, ${formatMoneyDecimal(rule.amount, rule.currency)}. Edit`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{rule.description}</span>
                    <span className="block text-[13px] text-[color:var(--color-ink-3)]">
                      {[cadenceLabel(rule.cadence), when, category?.name].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      !rule.active
                        ? "text-[color:var(--color-ink-3)]"
                        : rule.kind === "income"
                          ? "text-[color:var(--color-positive)]"
                          : "text-[color:var(--color-ink)]"
                    )}
                  >
                    {rule.kind === "income" ? "+" : "−"}
                    {formatMoneyDecimal(rule.amount, rule.currency)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2">
        <button type="button" className="nm-balance-text-action" onClick={onAdd}>
          + Add recurring
        </button>
      </div>
    </section>
  );
}
