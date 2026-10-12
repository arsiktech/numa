import { useMutation } from 'convex/react';
import { useMemo } from 'react';

import { cloud } from '@/cloud/api';
import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { newMutationId, useCloudData } from '@/data/cloud';
import { demoDebts, demoHoldings, demoNow, demoOctober } from '@/data/demo';
import type { AnswerData } from './answer';
import type { AskContext, Draft } from './parse';
import { bindUndo, plan, type Op, type WriteName } from './plan';

export type Saved = { undo: () => Promise<void> };
export type AskSource =
  | { status: 'loading' }
  | { status: 'ready'; demo: boolean; ctx: AskContext; answers: AnswerData; save: (d: Draft) => Promise<Saved> };

/** The labelled demo portfolio. Saving here keeps nothing. */
export function useDemoAskSource(): AskSource {
  return useMemo(() => {
    const summary = summarize(demoHoldings, demoDebts, demoNow);
    return {
      status: 'ready',
      demo: true,
      ctx: { currency: 'EUR', now: new Date(), categories: [], assets: [], liabilities: [], holdings: [] },
      answers: { summary, available: true, currency: 'EUR', month: demoOctober, flow: summarizeFlow(demoOctober), debts: demoDebts },
      save: async () => ({ undo: async () => {} }),
    };
  }, []);
}

/** The signed-in person's portfolio. Every write carries a clientMutationId receipt. */
export function useCloudAskSource(): AskSource {
  const data = useCloudData();
  const fns: Record<WriteName, (args: never) => Promise<{ id: string }>> = {
    createTransaction: useMutation(cloud.createTransaction),
    deleteTransaction: useMutation(cloud.deleteTransaction),
    upsertAsset: useMutation(cloud.upsertAsset),
    deleteAsset: useMutation(cloud.deleteAsset),
    upsertLiability: useMutation(cloud.upsertLiability),
    deleteLiability: useMutation(cloud.deleteLiability),
    upsertHolding: useMutation(cloud.upsertHolding),
    deleteHolding: useMutation(cloud.deleteHolding),
  } as never;

  if (data.status !== 'ready') return { status: 'loading' };
  const { snapshot, data: home, summary, fx, portfolioId } = data;
  const run = async (op: Op) => {
    const result = await fns[op.fn]({ ...op.args, clientMutationId: newMutationId(`numa.ask.${op.fn}`) } as never);
    return typeof result === 'string' ? result : result.id;
  };
  return {
    status: 'ready',
    demo: false,
    ctx: { currency: home.currency, now: new Date(), categories: snapshot.categories, assets: snapshot.assets, liabilities: snapshot.liabilities, holdings: snapshot.holdings },
    answers: { summary, available: home.unconverted.length === 0, currency: home.currency, month: home.month, flow: summarizeFlow(home.month), debts: home.debts },
    save: async (d) => {
      const p = plan(d, portfolioId, fx, Date.now());
      if ('error' in p) throw new Error(p.error);
      const id = await run(p.apply);
      const undo = bindUndo(p.undo, id);
      return { undo: async () => { await run(undo); } };
    },
  };
}
