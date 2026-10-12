import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { storage } from '@/cloud/storage';

/** Device preferences. They stay on this device and are not account data. */
export type ThemeChoice = 'auto' | 'dark' | 'light';

type Prefs = {
  theme: ThemeChoice;
  hideAmounts: boolean;
  /** First-visit tips the person has already dismissed. */
  seenTips: string[];
  /** Signed out but chose to look around the demo portfolio. */
  demo: boolean;
};

type PrefsValue = Prefs & {
  ready: boolean;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  seeTip: (id: string) => void;
};

const KEY = 'numa.prefs.v1';
const defaults: Prefs = { theme: 'auto', hideAmounts: false, seenTips: [], demo: false };
const PrefsContext = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    storage.getItem(KEY).then((raw) => {
      if (!alive) return;
      try { if (raw) setPrefs({ ...defaults, ...JSON.parse(raw) }); } catch { /* corrupt: start fresh */ }
      setReady(true);
    }, () => alive && setReady(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (ready) void storage.setItem(KEY, JSON.stringify(prefs)); }, [prefs, ready]);

  const set = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value })), []);
  const seeTip = useCallback((id: string) => setPrefs((p) => (p.seenTips.includes(id) ? p : { ...p, seenTips: [...p.seenTips, id] })), []);
  const value = useMemo(() => ({ ...prefs, ready, set, seeTip }), [prefs, ready, set, seeTip]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const v = useContext(PrefsContext);
  if (!v) throw new Error('usePrefs outside PrefsProvider');
  return v;
}
