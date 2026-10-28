import { useMutation, useQuery, useConnectionState } from 'convex/react';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { cloud } from '@/cloud/api';

/** Best effort only while visible and connected. This never queues an offline analytics write. */
export function useActiveDay() {
  const me = useQuery(cloud.me, {});
  const record = useMutation(cloud.recordActiveDay);
  const { isWebSocketConnected } = useConnectionState();
  const userId = me?.id ?? null;
  const deleting = me?.deletionScheduledAt != null || me?.deletionStartedAt != null;
  useEffect(() => {
    if (!userId || deleting || !isWebSocketConnected) return;
    let alive = true, busy = false, recordedDay: string | null = null;
    const visit = () => {
      const visible = Platform.OS === 'web' ? document.visibilityState !== 'hidden' : AppState.currentState === 'active';
      const today = new Date().toISOString().slice(0, 10);
      if (!alive || !visible || busy || recordedDay === today) return;
      busy = true;
      record({ expectedUserId: userId }).then(result => { if (alive) recordedDay = result.utcDate; }, () => { /* retry on the next visible tick, never persist a write */ }).finally(() => { busy = false; });
    };
    visit();
    const timer = setInterval(visit, 60_000);
    const foreground = AppState.addEventListener('change', visit);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', visit);
    return () => { alive = false; clearInterval(timer); foreground.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', visit); };
  }, [userId, deleting, isWebSocketConnected, record]);
}

export function ActiveDayTracker() { useActiveDay(); return null; }
