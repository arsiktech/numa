import { useConvexAuth } from 'convex/react';

import { usePrefs } from '@/state/prefs';
import { cloudEnabled } from './CloudProvider';

export type Session =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'demo'; canSignIn: boolean }
  | { kind: 'signedIn' };

// cloudEnabled never changes while the app runs, so the hook order is stable.
const useAuth: () => { isLoading: boolean; isAuthenticated: boolean } = cloudEnabled
  ? useConvexAuth
  : () => ({ isLoading: false, isAuthenticated: false });

/** Who is looking: a signed-in person, someone exploring demo data, or nobody yet. */
export function useSession(): Session {
  const { ready, demo } = usePrefs();
  const auth = useAuth();
  if (!ready || auth.isLoading) return { kind: 'loading' };
  if (auth.isAuthenticated) return { kind: 'signedIn' };
  if (!cloudEnabled) return { kind: 'demo', canSignIn: false };
  return demo ? { kind: 'demo', canSignIn: true } : { kind: 'signedOut' };
}
