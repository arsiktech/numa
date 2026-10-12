export type DeletionBannerPhase =
  | "idle"
  | "canceling"
  | "canceled"
  | "already-started"
  | "already-deleted"
  | "hidden";

export type DeletionBannerView =
  | "warning"
  | "canceling"
  | "canceled"
  | "already-started"
  | "already-deleted"
  | "hidden";

export function cancellationResultPhase(result: unknown): DeletionBannerPhase {
  if (typeof result !== "object" || result === null || !("ok" in result)) {
    return "idle";
  }
  if (result.ok === true) return "canceled";
  if (result.ok !== false || !("reason" in result)) return "idle";
  if (result.reason === "already-started") return "already-started";
  if (result.reason === "already-deleted") return "already-deleted";
  return "idle";
}

export function resolveDeletionBannerView({
  phase,
  scheduledAt,
  startedAt
}: {
  phase: DeletionBannerPhase;
  scheduledAt: number | null;
  startedAt: number | null;
}): DeletionBannerView {
  if (startedAt !== null || phase === "already-started") return "already-started";
  if (phase === "already-deleted") return "already-deleted";
  if (phase === "canceled") return "canceled";
  if (scheduledAt === null) return "hidden";
  if (phase === "canceling") return "canceling";
  if (phase === "idle") return "warning";
  return "hidden";
}
