import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/services/auth";
import { useCloudMutations, useCloudState } from "@/services/cloudStore";
import { useNuma } from "@/services/store";
import { useFxRates } from "@/services/fxSync";
import { useWriteQueue } from "@/services/writeQueue";
import { buildAutoSnapshot } from "@/lib/autoSnapshot";
import type { Id } from "../../convex/_generated/dataModel";

export function useAutoSnapshots() {
  const { currentAccount } = useAuth();
  const cloud = useCloudState();
  const { state } = useNuma();
  const { rates } = useFxRates();
  const { addSnapshot } = useCloudMutations();
  const { runOrQueue } = useWriteQueue();
  const attempts = useRef(new Map<string, number>());
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!cloud.enabled || cloud.authTransitioning || !currentAccount?.isCloud || currentAccount.id === "cloud-loading") return;
    const month = new Date(now).toISOString().slice(0, 7);
    for (const data of Object.values(cloud.byPortfolio)) {
      const role = data.memberships.find(member => member.userId === currentAccount.id)?.role;
      if (role !== "owner" && role !== "editor") continue;
      if (data.snapshots.some(snapshot => new Date(snapshot.takenAt).toISOString().slice(0, 7) === month)) continue;
      const clientMutationId = `auto-snapshot:${currentAccount.id}:${data.portfolio.id}:${month}`;
      if ((attempts.current.get(clientMutationId) ?? 0) > now) continue;
      const values = buildAutoSnapshot(data, state.marketQuotes, rates, now);
      if (!values) continue;
      const payload = { ...values, portfolioId: data.portfolio.id as Id<"portfolios">, clientMutationId };
      // No persisted "saved" flag. Confirmed server snapshots are authoritative;
      // network failures are retryable, and the server deduplicates per UTC month.
      attempts.current.set(clientMutationId, Infinity);
      void runOrQueue({ operation: "wealthSnapshots.add", payload, clientMutationId,
        execute: () => addSnapshot(payload)
      }).catch(() => undefined).finally(() => {
        attempts.current.set(clientMutationId, Date.now() + 60_000);
      });
    }
  }, [cloud.byPortfolio, cloud.enabled, cloud.authTransitioning, currentAccount, state.marketQuotes, rates, now, addSnapshot, runOrQueue]);
}
