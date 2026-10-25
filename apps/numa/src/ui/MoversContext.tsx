import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useCloudData } from '@/data/cloud';
import type { HomeMovementReport } from '@/data/homeMovers';
import type { Currency } from '@/domain/types';

export type MoversRequest = { report: HomeMovementReport; currency: Currency };
type State = { scope: string; evidence: unknown; generation: number; request: MoversRequest | null };
type Value = { request: MoversRequest | null; open: (request: MoversRequest) => void; clear: () => void };
const Context = createContext<Value | null>(null);

/**
 * Ephemeral navigation state: no money, names or account ids go in URLs or persistent storage.
 * A new account, space, currency, quote snapshot or minute of freshness invalidates the report.
 */
export function MoversProvider({ scope, evidence, children }: { scope: string; evidence: unknown; children: ReactNode }) {
  const [state, setState] = useState<State>({ scope, evidence, generation: 0, request: null });
  const valid = state.scope === scope && Object.is(state.evidence, evidence);
  // Adjust this provider's own state before committing children. A -> B -> A must get a
  // new generation even when A reuses the exact same evidence object.
  if (!valid) setState({ scope, evidence, generation: state.generation + 1, request: null });
  const generation = state.generation;
  // Each action consumes its generation. A late open after clear (or an older report's
  // clear after a new open) cannot resurrect, replace or dismiss the current report.
  const open = useCallback((request: MoversRequest) => {
    setState((previous) => previous.generation === generation
      ? { ...previous, generation: previous.generation + 1, request }
      : previous);
  }, [generation]);
  const clear = useCallback(() => {
    setState((previous) => previous.generation === generation
      ? { ...previous, generation: previous.generation + 1, request: null }
      : previous);
  }, [generation]);
  const request = valid ? state.request : null;
  const value = useMemo<Value>(() => ({ request, open, clear }), [request, open, clear]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function CloudMoversProvider({ children }: { children: ReactNode }) {
  const cloud = useCloudData();
  const scope = cloud.status === 'ready' ? `cloud:${cloud.boot.profile.userId}:${cloud.portfolioId}:${cloud.data.currency}` : 'cloud:unavailable';
  return <MoversProvider scope={scope} evidence={cloud.status === 'ready' ? cloud.data : null}>{children}</MoversProvider>;
}

export function useMovers() {
  const value = useContext(Context);
  if (!value) throw new Error('useMovers outside MoversProvider');
  return value;
}
