import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RecordHistory } from "@/components/features/RecordHistory";
import { historyWhen, recordTypeLabel } from "@/lib/recordHistory";
import { isCloudId, useCloudState } from "@/services/cloudStore";
import { useCurrentPortfolioId } from "@/services/store";

function DeletedList({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = useQuery(api.recordHistory.deleted, { portfolioId: portfolioId as Id<"portfolios"> });
  if (!rows) return null;
  if (!rows.length) return <p className="text-[13px] text-[color:var(--color-ink-3)]">Nothing deleted.</p>;
  return (
    <ul aria-label="Deleted records" className="flex flex-col">
      {rows.map((row) => {
        const expanded = open === row.recordId;
        return (
          <li key={row._id} className="border-b border-[color:var(--color-line)] last:border-b-0">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : row.recordId)}
              className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-[color:var(--color-ink)]">{row.recordName || recordTypeLabel(row.recordType)}</span>
                <span className="block truncate text-[12px] text-[color:var(--color-ink-3)]">{recordTypeLabel(row.recordType)}</span>
              </span>
              <time className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-[color:var(--color-ink-3)]" dateTime={new Date(row.at).toISOString()}>
                {historyWhen(row.at)}
              </time>
            </button>
            {expanded ? <div className="pb-3"><RecordHistory portfolioId={portfolioId} recordId={row.recordId} /></div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Records deleted from the current space, newest first, each with its history. Read only. */
export function DeletedRecordsCard() {
  const { isAuthenticated } = useConvexAuth();
  const cloud = useCloudState();
  const [portfolioId] = useCurrentPortfolioId();
  if (!isAuthenticated || !cloud.enabled || !portfolioId || !isCloudId(cloud, portfolioId)) return null;
  return (
    <Card id="settings-deleted">
      <CardHeader title="Deleted" />
      <CardBody>
        <ErrorBoundary fallback={() => null}>
          <DeletedList portfolioId={portfolioId} />
        </ErrorBoundary>
      </CardBody>
    </Card>
  );
}
