import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { storage } from '@/cloud/storage';
import { tomorrow } from '@/domain/attention';

/** Device preferences. They stay on this device and are not account data. */
export type ThemeChoice = 'auto' | 'dark' | 'light';

type Prefs = {
  theme: ThemeChoice;
  hideAmounts: boolean;
  /** First-visit tips the person has already dismissed. */
  seenTips: string[];
  /** Signed out but chose to look around the demo portfolio. */
  demo: boolean;
  /** Needs you items the person dismissed ("Got it") or snoozed ("Later"). Keyed by item id. */
  dismissed: Record<string, Dismissal>;
  /** The space this device last opened. Ignored if the signed-in account can't see it. */
  space: string | null;
};

/** `title` is what was dismissed: if the item's title changes, it comes back. `until` is a snooze end, or null for good. */
export type Dismissal = { title: string; until: number | null };

type PrefsValue = Prefs & {
  ready: boolean;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  seeTip: (id: string) => void;
  /** Hide an item for good ("Got it"), until tomorrow ("Later"), or bring it back (null). */
  dismiss: (id: string, d: { title: string; later: boolean } | null) => void;
};

const KEY = 'numa.prefs.v1';
const defaults: Prefs = { theme: 'auto', hideAmounts: false, seenTips: [], demo: false, dismissed: {}, space: null };
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
  const dismiss = useCallback((id: string, d: { title: string; later: boolean } | null) => {
    const entry: Dismissal | null = d ? { title: d.title, until: d.later ? tomorrow(Date.now()) : null } : null;
    setPrefs((p) => {
      const next = { ...p.dismissed };
      if (entry) next[id] = entry; else delete next[id];
      return { ...p, dismissed: next };
    });
  }, []);
  const value = useMemo(() => ({ ...prefs, ready, set, seeTip, dismiss }), [prefs, ready, set, seeTip, dismiss]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const v = useContext(PrefsContext);
  if (!v) throw new Error('usePrefs outside PrefsProvider');
  return v;
}
