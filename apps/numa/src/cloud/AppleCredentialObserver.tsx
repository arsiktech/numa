import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useEffectEvent } from 'react';
import { AppState, Platform } from 'react-native';
import { appleNativeIdentity, matchesAppleSession } from './appleLifecycle';

/** Only this session's server-bound Apple subject can invalidate native auth. */
export function AppleCredentialObserver() {
  const { isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  const result = useQuery(appleNativeIdentity, isAuthenticated ? {} : 'skip');
  const identity = matchesAppleSession(result, token) ? result : undefined;
  const { signOut } = useAuthActions();
  useEffect(() => {
    if (isAuthenticated && identity?.userId && !identity.exists) void signOut().catch(() => undefined);
  }, [identity, isAuthenticated, signOut]);
  const subject = identity?.subject; const userId = identity?.userId; const sessionId = identity?.sessionId;
  const currentAppleSession = isAuthenticated && subject && userId && sessionId ? `${userId}|${sessionId}|${subject}` : null;
  // Effect Events read the latest committed bearer-bound identity without mutating refs during render.
  const endObservedSession = useEffectEvent(async (observedSession: string) => {
    if (currentAppleSession === observedSession) await signOut();
  });
  useEffect(() => {
    if (Platform.OS !== 'ios' || !isAuthenticated || !subject || !userId || !sessionId) return;
    let live = true; let ending = false;
    const observedSession = `${userId}|${sessionId}|${subject}`;
    const endSession = () => {
      if (!live || ending) return;
      ending = true; void endObservedSession(observedSession).catch(() => { ending = false; });
    };
    const check = async () => {
      try {
        const state = await AppleAuthentication.getCredentialStateAsync(subject);
        if (state === AppleAuthentication.AppleAuthenticationCredentialState.REVOKED || state === AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND) endSession();
      } catch { /* Offline/unknown state is not proof of revocation. */ }
    };
    const revoke = AppleAuthentication.addRevokeListener(endSession);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    void check();
    return () => { live = false; revoke.remove(); foreground.remove(); };
  }, [subject, userId, sessionId, isAuthenticated, signOut]);
  return null;
}
