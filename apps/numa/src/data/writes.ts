import { useMutation } from 'convex/react';
import { useCallback } from 'react';

import { cloud } from '@/cloud/api';
import type { Op, WriteName } from '@/ask/plan';
import { newMutationId } from './cloud';

/** Runs one planned write with its own clientMutationId receipt and returns the record id. */
export function useWriter(): (op: Op) => Promise<string> {
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
  return useCallback(async (op: Op) => {
    const all = { createTransaction, updateTransaction, deleteTransaction, upsertAsset, deleteAsset, upsertLiability, deleteLiability, upsertHolding, deleteHolding, upsertGoal, removeGoal, updateCategory, addSnapshot, updateSnapshot, removeSnapshot };
    const result = await all[op.fn]({ ...op.args, clientMutationId: newMutationId(`numa.${op.fn}`) } as never);
    return typeof result === 'string' ? result : result?.id;
  }, [createTransaction, updateTransaction, deleteTransaction, upsertAsset, deleteAsset, upsertLiability, deleteLiability, upsertHolding, deleteHolding, upsertGoal, removeGoal, updateCategory, addSnapshot, updateSnapshot, removeSnapshot]);
}
