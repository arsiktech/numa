import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { findDuplicateTransactions } from "@/lib/analytics";
import { formatMoney } from "@/lib/money";

export function DuplicatesBanner({
  groups,
  onJumpTo
}: {
  groups: ReturnType<typeof findDuplicateTransactions>;
  onJumpTo: (tx: Transaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("numa:dupes:dismissed");
  });

  // Build a stable key from the ids in groups so a fresh dup re-shows the banner.
  const key = useMemo(
    () =>
      groups
        .map((g) =>
          g.txs
            .map((t) => t.id)
            .sort()
            .join(",")
        )
        .sort()
        .join("|"),
    [groups]
  );
  if (dismissedKey === key) return null;

  function dismiss() {
    setDismissedKey(key);
    try {
      window.sessionStorage.setItem("numa:dupes:dismissed", key);
    } catch {
      /* ignore */
    }
  }

  const totalDupes = groups.reduce((s, g) => s + g.txs.length, 0);
  return (
    <div className="rounded-2xl border border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-mist)] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
            Possible duplicate{groups.length === 1 ? "" : "s"} detected
          </p>
          <p className="text-[12px] text-[color:var(--color-ink-3)]">
            {totalDupes} transaction{totalDupes === 1 ? "" : "s"} in {groups.length}{" "}
            group{groups.length === 1 ? "" : "s"} — same amount, similar description, within 3 days.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] font-semibold text-[color:var(--color-warning)] px-2 h-8 rounded-lg hover:bg-[color:var(--color-paper)]/60"
        >
          {expanded ? "Hide" : "Review"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-[12px] font-medium text-[color:var(--color-ink-4)] px-2 h-8 rounded-lg hover:bg-[color:var(--color-paper)]/60"
        >
          Dismiss
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-2.5">
          {groups.map((group, idx) => (
            <div key={idx} className="rounded-xl bg-[color:var(--color-paper)] border border-[color:var(--color-line)] p-3">
              <p className="text-[11.5px] uppercase tracking-[0.06em] text-[color:var(--color-ink-3)] mb-1.5">
                {group.reason}
              </p>
              <div className="space-y-1">
                {group.txs.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onJumpTo(tx)}
                    className="w-full flex items-center justify-between gap-3 text-[12.5px] py-1 px-2 rounded-lg hover:bg-[color:var(--color-cream-50)] text-left"
                  >
                    <span className="text-[color:var(--color-ink-2)] truncate">
                      {tx.description} ·{" "}
                      <span className="text-[color:var(--color-ink-4)]">
                        {new Date(tx.occurredAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric"
                        })}
                      </span>
                    </span>
                    <span className="nm-num font-semibold text-[color:var(--color-ink)] shrink-0">
                      {formatMoney(tx.amount, tx.currency)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-[color:var(--color-ink-4)]">
            Tap a row to open and edit/delete. We won't auto-merge — you decide.
          </p>
        </div>
      ) : null}
    </div>
  );
}

