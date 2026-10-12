import { useEffect, useRef, useState } from "react";
import { useDomainActions } from "@/services/domainActions";
import { makeClientMutationId } from "@/services/writeQueue";
import type { WealthSnapshot } from "@/lib/types";

export type SnapshotPhase = "idle" | "saving" | "saved" | "queued" | "error";
type Input = Omit<WealthSnapshot, "id">;

/** One manual capture intent survives a failed response. Feedback belongs to
 * the portfolio that started it, never to a newly selected portfolio. */
export function useManualSnapshot(portfolioId: string) {
  const actions = useDomainActions();
  const [state, setState] = useState<{ portfolioId: string; phase: SnapshotPhase; message: string }>({ portfolioId, phase: "idle", message: "" });
  const request = useRef<{ portfolioId: string; pending: boolean; input: Input; clientMutationId: string } | null>(null);
  useEffect(() => { request.current = null; setState({ portfolioId, phase: "idle", message: "" }); }, [portfolioId]);

  async function capture(input: Input | null) {
    if (request.current?.pending) return;
    if (!request.current && (!input || input.portfolioId !== portfolioId)) {
      setState({ portfolioId, phase: "error", message: "Snapshot unavailable. Check investment prices, exchange rates and included wallets, then try again." });
      return;
    }
    const intent = request.current ?? { portfolioId, pending: false, input: input!, clientMutationId: makeClientMutationId("wealthSnapshots.add") };
    request.current = intent;
    intent.pending = true;
    setState({ portfolioId, phase: "saving", message: "Saving your wealth snapshot…" });
    try {
      const result = await actions.createSnapshot(intent.input, { clientMutationId: intent.clientMutationId });
      if (request.current !== intent) return;
      request.current = null;
      setState({ portfolioId, phase: result.queued ? "queued" : "saved", message: result.queued ? "Snapshot queued. It will sync when you're connected." : "Snapshot saved. Your wealth log is up to date." });
    } catch (error) {
      if (request.current !== intent) return;
      intent.pending = false;
      setState({ portfolioId, phase: "error", message: error instanceof Error ? error.message : "Snapshot could not be saved. Try again." });
    }
  }
  return { capture, phase: state.portfolioId === portfolioId ? state.phase : "idle" as SnapshotPhase, message: state.portfolioId === portfolioId ? state.message : "" };
}
