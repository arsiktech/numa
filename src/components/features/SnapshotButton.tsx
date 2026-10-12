import { Button } from "@/components/ui/Button";
import type { SnapshotPhase } from "@/hooks/useManualSnapshot";

export function SnapshotButton({ phase, onCapture, first = false }: {
  phase: SnapshotPhase; onCapture: () => void; first?: boolean;
}) {
  return <Button type="button" variant="secondary" disabled={phase === "saving"} onClick={onCapture}>
    {phase === "saving" ? "Saving snapshot…" : phase === "error" ? "Try snapshot again" : first ? "Take your first snapshot" : "Snapshot now"}
  </Button>;
}
