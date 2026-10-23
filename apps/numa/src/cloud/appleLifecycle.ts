import { makeFunctionReference } from 'convex/server';
export const appleReadiness = makeFunctionReference<'query', Record<string, never>, { configured: boolean; liveVerified: false }>('appleLifecycle:readiness');
export type AppleNativeIdentity = { userId: string | null; sessionId: string | null; exists: boolean; subject: string | null };
export const appleNativeIdentity = makeFunctionReference<'query', Record<string, never>, AppleNativeIdentity>('appleLifecycle:nativeIdentity');

/** Correlate a reactive result with the current SDK bearer, not a last-used
 * preference. This is only stale-result rejection; the server proves provenance. */
export function matchesAppleSession(identity: AppleNativeIdentity | undefined, token: string | null): boolean {
  if (!identity || !token) return false;
  try {
    const body = token.split('.')[1]!;
    const raw = body.replace(/-/g, '+').replace(/_/g, '/');
    const { sub } = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')));
    return typeof sub === 'string' && sub === `${identity.userId}|${identity.sessionId}`;
  } catch { return false; }
}
