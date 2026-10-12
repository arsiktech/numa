import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { holdingValueCurrency } from "@/lib/analytics";
import { convertCurrency, type FxRates } from "@/lib/fx";
import { formatMoneyDecimal } from "@/lib/money";
import type { CurrencyCode, Holding, HoldingEvent, MarketQuote } from "@/lib/types";

/**
 * One holding: value, cost, gain and its buy/sell history, with Edit and a
 * two-step Delete. Opened from a row on the home Balance view.
 */
export function HoldingDetailDialog({
  holding,
  quote,
  events,
  baseCurrency,
  rates,
  onClose,
  onEdit,
  onDelete
}: {
  holding: Holding | null;
  quote?: MarketQuote;
  events: HoldingEvent[];
  baseCurrency: CurrencyCode;
  rates: FxRates;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!holding) return null;

  const priceCurrency = holdingValueCurrency(holding, quote);
  const unitPrice = quote?.price ?? (holding.quantity > 0 ? holding.costBasis / holding.quantity : 0);
  const value = convertCurrency(unitPrice * holding.quantity, priceCurrency, baseCurrency, rates);
  const cost = convertCurrency(holding.costBasis, holding.currency, baseCurrency, rates);
  const gain = value - cost;
  const history = events.length
    ? events
    : [
        {
          id: "initial",
          kind: "buy" as const,
          quantity: holding.quantity,
          total: holding.costBasis,
          currency: holding.currency,
          occurredAt: holding.acquiredAt
        }
      ];

  function close() {
    setConfirmDelete(false);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      dismissible={!deleting}
      title={holding.name || holding.symbol}
      description={`${holding.quantity} ${holding.symbol}${quote ? "" : ", no price yet, shown at cost"}`}
      footer={
        confirmDelete ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-[14px] text-[color:var(--color-ink-2)]">Delete this holding? This can't be undone.</span>
            <Button type="button" variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              aria-label="Confirm delete holding"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await onDelete();
                  setConfirmDelete(false);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete holding
            </Button>
            <Button type="button" variant="primary" onClick={onEdit}>
              Edit holding
            </Button>
          </div>
        )
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[15px]">
        <Metric label="Value now" value={formatMoneyDecimal(value, baseCurrency)} />
        <Metric label="You paid" value={formatMoneyDecimal(cost, baseCurrency)} />
        <Metric label="Price" value={formatMoneyDecimal(unitPrice, priceCurrency)} />
        <Metric
          label="Gain"
          value={`${gain >= 0 ? "+" : "−"}${formatMoneyDecimal(Math.abs(gain), baseCurrency)}`}
          tone={Number.isFinite(gain) ? (gain >= 0 ? "positive" : "negative") : undefined}
        />
      </dl>
      <h3 className="mt-6 text-[15px] font-semibold">History</h3>
      <ul className="mt-1">
        {history.map((event) => (
          <li key={event.id} className="nm-balance-row">
            <span>
              <span className="block capitalize">{event.kind}</span>
              <span className="block text-[13px] text-[color:var(--color-ink-3)]">
                {new Date(event.occurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block">
                {event.quantity} {holding.symbol}
              </span>
              <span className="block text-[13px] text-[color:var(--color-ink-3)]">
                {formatMoneyDecimal(event.total, event.currency)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <dt className="text-[13px] text-[color:var(--color-ink-3)]">{label}</dt>
      <dd
        className={
          "mt-0.5 font-semibold tabular-nums " +
          (tone === "positive"
            ? "text-[color:var(--color-positive)]"
            : tone === "negative"
              ? "text-[color:var(--color-negative)]"
              : "text-[color:var(--color-ink)]")
        }
      >
        {value}
      </dd>
    </div>
  );
}
