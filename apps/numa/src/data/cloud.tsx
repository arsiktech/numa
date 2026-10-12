import { useMutation, useQuery } from 'convex/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { cloud, type CloudBootstrap, type CloudCurrency, type CloudSnapshot, type CloudSpace, type CloudWallet, type CloudWalletDoc } from '@/cloud/api';
import { storage } from '@/cloud/storage';
import { usePrefs } from '@/state/prefs';
import { summarize, type Summary } from '@/domain/summary';
import { fromSnapshot, type HomeData } from './fromSnapshot';
import { parseFrankfurter, readSavedFx, type FxRate } from './fx';

/** The signed-in person's data, loaded once and shared by Home and Ask. */
export type CloudData =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'needsSpace'; create: (currency: CloudCurrency) => Promise<void> }
  | { status: 'ready'; boot: CloudBootstrap; portfolioId: string; space: CloudSpace; spaces: CloudSpace[]; selectSpace: (id: string) => void; snapshot: CloudSnapshot; data: HomeData; summary: Summary; fx: FxRate | null; now: number };

const FX_KEY = 'numa.fx.v1';
const CloudContext = createContext<CloudData | null>(null);

/** Today's ECB euro-dollar rate, falling back to the last one this device saw. */
function useFx(): { fx: FxRate | null; settled: boolean } {
  const [fx, setFx] = useState<FxRate | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
        const rate = res.ok ? parseFrankfurter(await res.json()) : null;
        if (rate) { if (alive) setFx(rate); void storage.setItem(FX_KEY, JSON.stringify(rate)); return; }
      } catch { /* offline: use the saved rate */ }
      const saved = readSavedFx(await storage.getItem(FX_KEY));
      if (alive) setFx(saved);
    })().finally(() => alive && setSettled(true));
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
  const { fx, settled } = useFx();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    bootstrap({}).then((b) => alive && setBoot(b), () => alive && setError('Couldn’t reach Numa. Check your connection and try again.'));
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
  const base = useQuery(cloud.portfolioSnapshot, portfolioId ? { portfolioId } : 'skip');
  const walletDocs = useQuery(cloud.listWallets, portfolioId ? { portfolioId } : 'skip');
  // Wallets ride along with the snapshot. Until they load, the snapshot waits, so no total jumps.
  const snapshot = useMemo<CloudSnapshot | undefined>(() => (base && walletDocs ? { ...base, wallets: walletDocs.map(toWallet) } : undefined), [base, walletDocs]);
  const retry = useCallback(() => { setError(null); setAttempt((a) => a + 1); }, []);
  const create = useCallback(async (currency: CloudCurrency) => {
    await createPortfolio({ name: 'Personal', type: 'personal', tagline: '', defaultCurrency: currency, seedDefaults: true, clientMutationId: newMutationId('portfolios.create') });
    setAttempt((a) => a + 1);
  }, [createPortfolio]);

  const data = useMemo(() => (snapshot && settled ? fromSnapshot(snapshot, fx, new Date(now)) : null), [snapshot, settled, fx, now]);
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
