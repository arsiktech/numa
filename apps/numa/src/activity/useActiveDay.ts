import { useMutation, useQuery, useConvexConnectionState } from 'convex/react';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { cloud } from '@/cloud/api';

/** Best effort only while visible and connected. This never queues an offline analytics write. */
export function useActiveDay() {
  const me = useQuery(cloud.me, {});
  const record = useMutation(cloud.recordActiveDay);
  const { isWebSocketConnected } = useConvexConnectionState();
  const userId = me?.id ?? null;
  const deleting = me?.deletionScheduledAt != null || me?.deletionStartedAt != null;
  useEffect(() => {
    if (!userId || deleting || !isWebSocketConnected) return;
    let alive = true, busy = false, recheckAt = 0;
    const visit = (force = false) => {
      const visible = Platform.OS === 'web' ? document.visibilityState !== 'hidden' : AppState.currentState === 'active';
      if (!alive || !visible || busy || (!force && performance.now() < recheckAt)) return;
      busy = true;
      record({ expectedUserId: userId }).then(result => {
        if (!alive) return;
        // Server UTC expiry plus a monotonic clock avoids device-calendar skew. Revalidate at least every five minutes.
        const ttl = Number.isFinite(result.recheckAfterMs) ? result.recheckAfterMs! : 300_000;
        recheckAt = performance.now() + Math.max(1000, Math.min(ttl, 300_000));
      }, () => { /* retry on the next visible tick, never persist a write */ }).finally(() => { busy = false; });
    };
    visit();
    const timer = setInterval(visit, 60_000);
    const revalidate = () => visit(true);
    const foreground = AppState.addEventListener('change', revalidate);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', revalidate);
    return () => { alive = false; clearInterval(timer); foreground.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', revalidate); };
  }, [userId, deleting, isWebSocketConnected, record]);
}

export function ActiveDayTracker() { useActiveDay(); return null; }
