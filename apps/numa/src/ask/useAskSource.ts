import { useAction, useConvex } from 'convex/react';
import { useAISharing, type AISharingControls } from '@/privacy/useAISharing';
import { requestPrivateAI } from '@/privacy/requestAI';
import { useEffect, useMemo, useRef } from 'react';

import { cloud, type AskReply, type AskTurn } from '@/cloud/api';
import { summarizeFlow } from '@/domain/flow';
import { summarize } from '@/domain/summary';
import { newMutationId, useCloudData } from '@/data/cloud';
import { offlineWriteError, staleWriteError } from '@/data/writeIntent';
import { liquidSummary, useInvested } from '@/loans/useInvested';
import { useWriter } from '@/data/writes';
import { demoDebts, demoHoldings, demoNow, demoOctober } from '@/data/demo';
import { aiContext } from './aiContext';
import type { AnswerData } from './answer';
import type { AskContext, Draft } from './parse';
import { bindUndo, plan } from './plan';
import type { DraftSaveIntent } from './draftSave';

export type Saved = { undo: () => Promise<void> };
export type AskSource =
  | { status: 'loading' }
  | {
      status: 'ready'; demo: boolean; contextKey: string; ctx: AskContext; answers: AnswerData; save: (d: Draft, intent?: DraftSaveIntent) => Promise<Saved>;
      prepareSave?: (d: Draft) => DraftSaveIntent;
      checkSave?: () => void;
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
  const invested = useInvested();
  const convex = useConvex();
  const key = data.status === 'ready' && sharing.state?.userId === data.boot.profile.userId ? `${data.boot.profile.userId}:${data.portfolioId}` : null;
  const scope = useMemo(() => ({ key }), [key]);
  const current = useRef<typeof scope | null>(scope);
  useEffect(() => { current.current = scope; return () => { current.current = null; }; }, [scope]);
  if (data.status !== 'ready') return { status: 'loading' };
  const { snapshot, data: home, fx, portfolioId } = data;
  // The same Liquid after debts as Home: money borrowed into a company is owed but not taken from it.
  const summary = liquidSummary(data.summary, invested);
  const expectedUserId = data.boot.profile.userId;
  if (!key || sharing.state?.userId !== expectedUserId) return { status: 'loading' };
  const checkSave = () => {
    if (current.current !== scope) throw staleWriteError();
    if (!convex.connectionState().isWebSocketConnected) throw offlineWriteError();
  };
  const prepareSave = (d: Draft): DraftSaveIntent => {
    checkSave();
    const p = plan(d, portfolioId, fx, Date.now());
    if ('error' in p) throw new Error(p.error);
    return { contextKey: key, clientMutationId: newMutationId(`numa.${p.apply.fn}`), ...p };
  };
  const ctx: AskContext = { currency: home.currency, now: new Date(), categories: snapshot.categories, assets: snapshot.assets, liabilities: snapshot.liabilities, holdings: snapshot.holdings };
  const answers: AnswerData = { summary, available: home.unconverted.length === 0, currency: home.currency, month: home.month, flow: summarizeFlow(home.month), debts: home.debts };
  return {
    status: 'ready',
    demo: false,
    contextKey: `${expectedUserId}:${portfolioId}`,
    sharing,
    checkSave,
    prepareSave,
    ctx,
    answers,
    ai: (message, history, stillCurrent) => requestPrivateAI({ expectedUserId, message, history, stillCurrent: () => current.current === scope && stillCurrent(), readPermission: sharing.read, buildContext: () => aiContext(ctx, answers, home.history), submit: askReply }),
    save: async (d, intent) => {
      checkSave();
      const p = intent ?? prepareSave(d);
      if (p.contextKey !== key) throw staleWriteError();
      const id = await run(p.apply, p.clientMutationId);
      const undo = bindUndo(p.undo, id);
      return { undo: async () => { checkSave(); await run(undo); } };
    },
  };
}
