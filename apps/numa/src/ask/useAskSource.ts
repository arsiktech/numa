import { useMemo } from 'react';

import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { useCloudData } from '@/data/cloud';
import { useWriter } from '@/data/writes';
import { demoDebts, demoHoldings, demoNow, demoOctober } from '@/data/demo';
import type { AnswerData } from './answer';
import type { AskContext, Draft } from './parse';
import { bindUndo, plan } from './plan';

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
  const run = useWriter();
  if (data.status !== 'ready') return { status: 'loading' };
  const { snapshot, data: home, summary, fx, portfolioId } = data;
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
