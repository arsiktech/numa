import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { isCloudId, useCloudState } from "@/services/cloudStore";
import { actorLabel, describeChange, historyWhen, presentHistory } from "@/lib/recordHistory";

function HistoryList({ portfolioId, recordId }: { portfolioId: string; recordId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const cloud = useCloudState();
  const live = isAuthenticated && cloud.enabled && isCloudId(cloud, portfolioId);
  const result = useQuery(api.recordHistory.list, live ? { portfolioId: portfolioId as Id<"portfolios">, recordId, limit: 50 } : "skip");
  if (!result?.entries.length) return null;
  return (
    <section aria-label="Change history" className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-medium text-[color:var(--color-ink-3)] uppercase tracking-[0.06em]">History</h3>
      <ol className="flex max-h-56 flex-col overflow-y-auto">
        {presentHistory(result.entries).map((change) => (
          <li key={change._id} className="flex items-baseline justify-between gap-3 border-b border-[color:var(--color-line)] py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-[color:var(--color-ink)]">{describeChange(change)}</p>
              <p className="truncate text-[12px] text-[color:var(--color-ink-3)]">
                {[actorLabel(change.actor), change.reason].filter(Boolean).join(" · ")}
              </p>
            </div>
            <time className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-[color:var(--color-ink-3)]" dateTime={new Date(change.at).toISOString()}>
              {historyWhen(change.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A record's change history, newest first. Shows nothing until there is some. */
export function RecordHistory(props: { portfolioId: string; recordId: string }) {
  return (
    <ErrorBoundary fallback={() => null}>
      <HistoryList {...props} />
    </ErrorBoundary>
  );
}
