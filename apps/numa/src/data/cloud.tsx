import { useMutation, useQuery } from 'convex/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { cloud, type CloudBootstrap, type CloudCurrency, type CloudSnapshot, type CloudSpace, type CloudWallet, type CloudWalletDoc } from '@/cloud/api';
import { storage } from '@/cloud/storage';
import { usePrefs } from '@/state/prefs';
import { summarize, type Summary } from '@/domain/summary';
import { fromSnapshot, type HomeData } from './fromSnapshot';
import { fetchFxRate, loadFx, type FxRate } from './fx';

/** The signed-in person's data, loaded once and shared by Home and Ask. */
export type CloudData =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'needsSpace'; create: (currency: CloudCurrency) => Promise<void> }
  | { status: 'ready'; boot: CloudBootstrap; portfolioId: string; space: CloudSpace; spaces: CloudSpace[]; selectSpace: (id: string) => void; snapshot: CloudSnapshot; data: HomeData; summary: Summary; fx: FxRate | null; now: number };

const FX_KEY = 'numa.fx.v1';
const CloudContext = createContext<CloudData | null>(null);

/** The ECB euro-dollar rate. A current saved rate shows at once; today's replaces it when it arrives. */
function useFx(): { fx: FxRate | null; settled: boolean } {
  const shared = useQuery(cloud.fxRate, {});
  const [local, setLocal] = useState<FxRate | null>(null);
  const [settled, setSettled] = useState(false);
  const fx = local ?? shared ?? null;
  useEffect(() => {
    let alive = true;
    void loadFx(
      { readSaved: () => storage.getItem(FX_KEY), fetchRate: () => fetchFxRate(), save: (raw) => void storage.setItem(FX_KEY, raw), now: Date.now() },
      (rate) => { if (alive) { setLocal(rate); setSettled(true); } },
    );
    return () => { alive = false; };
  }, []);
  return { fx, settled };
}

const toWallet = ({ _id, snapshot, ...w }: CloudWalletDoc): CloudWallet => ({ ...w, id: _id, snapshot: snapshot ?? null });

export function newMutationId(op: string) {
  return `${op}:mut_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function CloudDataProvider({ children }: { children: ReactNode }) {
  const bootstrap = useMutation(cloud.bootstrap);
  const createPortfolio = useMutation(cloud.createPortfolio);
  const [boot, setBoot] = useState<CloudBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { fx } = useFx();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    // This app subscribes to the snapshot below, so it doesn't ask bootstrap to build one too. A
    // backend still on the previous version rejects the new argument, so that case retries without it.
    bootstrap({ withSnapshot: false }).catch(() => bootstrap({}))
      .then((b) => alive && setBoot(b), () => alive && setError('Couldn’t reach Numa. Check your connection and try again.'));
    return () => { alive = false; };
  }, [bootstrap, attempt]);

  // Re-evaluate freshness every minute so stale prices are called out without a reload.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  // The space this device chose, if the account can still see it; otherwise the account's first.
  const prefs = usePrefs();
  const spaces = useQuery(cloud.listSpaces, boot ? {} : 'skip');
  const chosen = spaces?.find((s) => s.id === prefs.space) ?? null;
  const portfolioId = spaces === undefined || !prefs.ready ? null : (chosen?.id ?? boot?.selectedPortfolioId ?? spaces[0]?.id ?? null);
  const space = spaces?.find((s) => s.id === portfolioId) ?? null;
  const { set } = prefs;
  const selectSpace = useCallback((id: string) => set('space', id), [set]);
  // Only the last weeks of transactions ride with the snapshot, which keeps Home quick to load. `ledger.ts` reads older ones.
  const [since] = useState(() => Date.now() - 45 * 24 * 60 * 60 * 1000);
  const base = useQuery(cloud.portfolioSnapshot, portfolioId ? { portfolioId, since } : 'skip');
  const walletDocs = useQuery(cloud.listWallets, portfolioId ? { portfolioId } : 'skip');
  // Wallets ride along with the snapshot. Until they load, the snapshot waits, so no total jumps.
  const snapshot = useMemo<CloudSnapshot | undefined>(() => (base && walletDocs ? { ...base, wallets: walletDocs.map(toWallet) } : undefined), [base, walletDocs]);
  const retry = useCallback(() => { setError(null); setAttempt((a) => a + 1); }, []);
  const create = useCallback(async (currency: CloudCurrency) => {
    await createPortfolio({ name: 'Personal', type: 'personal', tagline: '', defaultCurrency: currency, seedDefaults: true, clientMutationId: newMutationId('portfolios.create') });
    setAttempt((a) => a + 1);
  }, [createPortfolio]);

  const data = useMemo(() => (snapshot ? fromSnapshot(snapshot, fx, new Date(now)) : null), [snapshot, fx, now]);
  const summary = useMemo(() => (data ? summarize(data.holdings, data.debts, new Date(now)) : null), [data, now]);

  const value = useMemo<CloudData>(() => {
    if (error) return { status: 'error', message: error, retry };
    if (boot && spaces && !portfolioId) return { status: 'needsSpace', create };
    if (!boot || !portfolioId || !space || !spaces || !snapshot || !data || !summary) return { status: 'loading' };
    return { status: 'ready', boot, portfolioId, space, spaces, selectSpace, snapshot, data, summary, fx, now };
  }, [error, retry, boot, spaces, portfolioId, space, selectSpace, create, snapshot, data, summary, fx, now]);

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloudData(): CloudData {
  const v = useContext(CloudContext);
  if (!v) throw new Error('useCloudData outside CloudDataProvider');
  return v;
}
