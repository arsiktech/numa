import { useConvex, useConvexAuth, useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { cloud } from '@/cloud/api';
import type { Op, WriteName } from '@/ask/plan';
import { newMutationId, useCloudData } from './cloud';
import { createWriteIntents, offlineWriteError, staleWriteError } from './writeIntent';

/** Refuse disconnected/stale confirmations before Convex can queue them. Server authorization still owns access. */
export function useWriter(): (op: Op, clientMutationId?: string) => Promise<string> {
  const data = useCloudData();
  const auth = useConvexAuth();
  const account = useQuery(cloud.aiSharing, {});
  useConvexConnectionState();
  const convex = useConvex();
  const key = data.status === 'ready' && auth.isAuthenticated && !auth.isLoading && account?.userId === data.boot.profile.userId && !account.deletionStarted
    ? JSON.stringify([data.boot.profile.userId, data.portfolioId]) : null;
  // A distinct token also invalidates old closures after switching away and back.
  const scope = useMemo(() => ({ key, intents: createWriteIntents(newMutationId) }), [key]);
  const current = useRef<typeof scope | null>(scope);
  useEffect(() => { current.current = scope; return () => { current.current = null; }; }, [scope]);
  const { intents } = scope;
  const portfolioId = data.status === 'ready' ? data.portfolioId : null;
  const check = useCallback((op: Op) => {
    if (!scope.key || current.current !== scope || (op.args.portfolioId !== undefined && op.args.portfolioId !== portfolioId)) throw staleWriteError();
    // Read at the actual submit boundary, not from an older render's connection value.
    if (!convex.connectionState().isWebSocketConnected) throw offlineWriteError();
  }, [scope, portfolioId, convex]);
  const fns: Record<WriteName, (args: never) => Promise<{ id: string } | string>> = {
    createTransaction: useMutation(cloud.createTransaction),
    updateTransaction: useMutation(cloud.updateTransaction),
    deleteTransaction: useMutation(cloud.deleteTransaction),
    upsertAsset: useMutation(cloud.upsertAsset),
    deleteAsset: useMutation(cloud.deleteAsset),
    upsertLiability: useMutation(cloud.upsertLiability),
    deleteLiability: useMutation(cloud.deleteLiability),
    upsertHolding: useMutation(cloud.upsertHolding),
    deleteHolding: useMutation(cloud.deleteHolding),
    upsertGoal: useMutation(cloud.upsertGoal),
    removeGoal: useMutation(cloud.removeGoal),
    updateCategory: useMutation(cloud.updateCategory),
    addSnapshot: useMutation(cloud.addSnapshot),
    updateSnapshot: useMutation(cloud.updateSnapshot),
    removeSnapshot: useMutation(cloud.removeSnapshot),
  } as never;
  const { createTransaction, updateTransaction, deleteTransaction, upsertAsset, deleteAsset, upsertLiability, deleteLiability, upsertHolding, deleteHolding, upsertGoal, removeGoal, updateCategory, addSnapshot, updateSnapshot, removeSnapshot } = fns;
  return useCallback(async (op: Op, clientMutationId?: string) => {
    check(op);
    const all = { createTransaction, updateTransaction, deleteTransaction, upsertAsset, deleteAsset, upsertLiability, deleteLiability, upsertHolding, deleteHolding, upsertGoal, removeGoal, updateCategory, addSnapshot, updateSnapshot, removeSnapshot };
    const id = await intents(op, async (receipt) => {
      check(op);
      const result = await all[op.fn]({ ...op.args, clientMutationId: receipt } as never);
      return typeof result === 'string' ? result : result.id;
    }, clientMutationId);
    if (current.current !== scope) throw staleWriteError();
    return id;
  }, [check, intents, scope, createTransaction, updateTransaction, deleteTransaction, upsertAsset, deleteAsset, upsertLiability, deleteLiability, upsertHolding, deleteHolding, upsertGoal, removeGoal, updateCategory, addSnapshot, updateSnapshot, removeSnapshot]);
}
