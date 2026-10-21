import { useAction } from 'convex/react';
import { useAISharing, type AISharingControls } from '@/privacy/useAISharing';
import { requestPrivateAI } from '@/privacy/requestAI';
import { useMemo } from 'react';

import { cloud, type AskReply, type AskTurn } from '@/cloud/api';
import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { useCloudData } from '@/data/cloud';
import { useWriter } from '@/data/writes';
import { demoDebts, demoHoldings, demoNow, demoOctober } from '@/data/demo';
import { aiContext } from './aiContext';
import type { AnswerData } from './answer';
import type { AskContext, Draft } from './parse';
import { bindUndo, plan } from './plan';

export type Saved = { undo: () => Promise<void> };
export type AskSource =
  | { status: 'loading' }
  | {
      status: 'ready'; demo: boolean; contextKey: string; ctx: AskContext; answers: AnswerData; save: (d: Draft) => Promise<Saved>;
      /** Asks Claude what the device couldn't answer. Missing in the demo. */
      ai?: (message: string, history: AskTurn[], stillCurrent: () => boolean) => Promise<AskReply>;
      sharing?: AISharingControls;
    };

/** The labelled demo portfolio. Saving here keeps nothing. */
export function useDemoAskSource(): AskSource {
  return useMemo(() => {
    const summary = summarize(demoHoldings, demoDebts, demoNow);
    return {
      status: 'ready',
      demo: true,
      contextKey: 'demo',
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
  const askReply = useAction(cloud.askReply);
  const sharing = useAISharing();
  if (data.status !== 'ready') return { status: 'loading' };
  const { snapshot, data: home, summary, fx, portfolioId } = data;
  const expectedUserId = data.boot.profile.userId;
  if (sharing.state?.userId && sharing.state.userId !== expectedUserId) return { status: 'loading' };
  const ctx: AskContext = { currency: home.currency, now: new Date(), categories: snapshot.categories, assets: snapshot.assets, liabilities: snapshot.liabilities, holdings: snapshot.holdings };
  const answers: AnswerData = { summary, available: home.unconverted.length === 0, currency: home.currency, month: home.month, flow: summarizeFlow(home.month), debts: home.debts };
  return {
    status: 'ready',
    demo: false,
    contextKey: `${expectedUserId}:${portfolioId}`,
    sharing,
    ctx,
    answers,
    ai: (message, history, stillCurrent) => requestPrivateAI({ expectedUserId, message, history, stillCurrent, readPermission: sharing.read, buildContext: () => aiContext(ctx, answers, home.history), submit: askReply }),
    save: async (d) => {
      const p = plan(d, portfolioId, fx, Date.now());
      if ('error' in p) throw new Error(p.error);
      const id = await run(p.apply);
      const undo = bindUndo(p.undo, id);
      return { undo: async () => { await run(undo); } };
    },
  };
}
