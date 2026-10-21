import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useLayoutEffect, useRef } from 'react';

import type { CloudSnapshot } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import type { FxRate } from '@/data/fx';
import { usePrefs } from '@/state/prefs';
import { claimWidgetWriter, clearWidget } from './lifecycle';
import { widgetPayload } from './payload';

export { clearWidget } from './lifecycle';

// The existing root imports this module even while auth loading prevents WidgetSync mounting.
// Fail closed at bundle startup; only the validated mounted writer may repopulate the app group.
clearWidget();

// Existing endpoint, no backend change. This returns only the current authenticated viewer ID.
const viewerId = makeFunctionReference<'query', Record<string, never>, string | null>('profiles:viewerId');

/** Uses already loaded financial data; no price-history or debt-event query is added. */
export function WidgetSync() {
  const cloud = useCloudData();
  const prefs = usePrefs();
  const session = useSession();
  const viewer = useQuery(viewerId, session.kind === 'signedIn' ? {} : 'skip');
  const writer = useRef<ReturnType<typeof claimWidgetWriter> | null>(null);
  const observed = useRef<{ owner: string; snapshot: CloudSnapshot; fx: FxRate | null; at: number } | null>(null);

  useLayoutEffect(() => {
    const lease = claimWidgetWriter();
    writer.current = lease;
    return () => {
      lease.release();
      if (writer.current === lease) writer.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!prefs.ready || session.kind !== 'signedIn' || cloud.status !== 'ready'
      || !viewer || viewer !== cloud.boot.profile.userId) {
      observed.current = null;
      writer.current?.publish(null, null);
      return;
    }
    // Preferences can change before the old snapshot is replaced by a loading/ready result.
    const selected = prefs.space && cloud.spaces.some((s) => s.id === prefs.space) ? prefs.space : cloud.portfolioId;
    if (selected !== cloud.portfolioId || cloud.snapshot.portfolio.id !== cloud.portfolioId
      || cloud.space.id !== cloud.portfolioId || !cloud.boot.profile.userId) {
      observed.current = null;
      writer.current?.publish(null, null);
      return;
    }
    // The identity is memory-only. It is never serialized into the app group.
    const owner = JSON.stringify([cloud.boot.profile.userId, cloud.portfolioId]);
    const previous = observed.current;
    if (!previous || previous.owner !== owner || previous.snapshot !== cloud.snapshot || previous.fx !== cloud.fx) {
      observed.current = { owner, snapshot: cloud.snapshot, fx: cloud.fx, at: Date.now() };
    }
    writer.current?.publish(owner, widgetPayload({
      snapshot: cloud.snapshot, data: cloud.data, summary: cloud.summary, fx: cloud.fx,
      hidden: prefs.hideAmounts, now: cloud.now, syncedAt: observed.current!.at,
    }));
  }, [cloud, prefs.ready, prefs.space, prefs.hideAmounts, session.kind, viewer]);
  return null;
}
