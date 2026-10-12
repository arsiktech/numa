import { SnapshotButton } from "@/components/features/SnapshotButton";
import type { SnapshotPhase } from "@/hooks/useManualSnapshot";
import { formatMoneyDecimal } from "@/lib/money";
import type { CurrencyCode, WealthSnapshot } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * The wealth log: one row per saved snapshot, newest first, with the change
 * since the one before. Snapshots are saved monthly on their own; "Snapshot
 * now" records today.
 */
export function NetWorthHistory({
  snapshots,
  currency,
  phase,
  message,
  onCapture
}: {
  snapshots: WealthSnapshot[];
  currency: CurrencyCode;
  phase: SnapshotPhase;
  message: string;
  onCapture: () => void;
}) {
  const rows = snapshots.slice().sort((a, b) => b.takenAt - a.takenAt).slice(0, 24);
  return (
    <section aria-labelledby="balance-history" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--color-ink)] pb-2">
        <h2 id="balance-history" className="text-[17px] font-semibold">
          Net worth history
        </h2>
        <SnapshotButton phase={phase} onCapture={onCapture} first={rows.length === 0} />
      </div>
      {message ? (
        <p role={phase === "error" ? "alert" : "status"} className="mt-2 text-[14px] text-[color:var(--color-ink-2)]">
          {message}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-3 text-[15px] text-[color:var(--color-ink-3)]">
          Numa Pro saves your net worth once a month so you can see how it moves. Take the first one now.
        </p>
      ) : (
        <ul>
          {rows.map((snap, index) => {
            const previous = rows[index + 1];
            const sameCurrency = previous && previous.currency === snap.currency;
            const delta = sameCurrency ? snap.netWorth - previous.netWorth : null;
            return (
              <li key={snap.id} className="nm-balance-row">
                <span>
                  <span className="block">
                    {new Date(snap.takenAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="block text-[13px] text-[color:var(--color-ink-3)]">{snap.isAuto ? "Monthly" : "Saved by you"}</span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block">{formatMoneyDecimal(snap.netWorth, snap.currency ?? currency)}</span>
                  {delta !== null ? (
                    <span
                      className={cn(
                        "block text-[13px]",
                        delta >= 0 ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-negative)]"
                      )}
                    >
                      {delta >= 0 ? "+" : "−"}
                      {formatMoneyDecimal(Math.abs(delta), snap.currency ?? currency)}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
