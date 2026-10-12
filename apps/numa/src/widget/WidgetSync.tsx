import { useEffect } from 'react';

import { useCloudData } from '@/data/cloud';
import { usePrefs } from '@/state/prefs';
import { widgetPayload } from './payload';
import { writeWidget } from './store';

/** Keeps the home-screen widget in step with Home: net worth, today's move, and Hide amounts. */
export function WidgetSync() {
  const cloud = useCloudData();
  const { hideAmounts } = usePrefs();
  const ready = cloud.status === 'ready' ? cloud : null;
  const netCents = ready?.summary.netCents ?? null;
  const available = ready ? ready.data.unconverted.length === 0 : false;
  const priced = ready?.data.holdings.filter((h) => h.valuation.kind === 'synced') ?? [];
  const todayCents = priced.length ? priced.reduce((s, h) => s + (h.changeTodayCents ?? 0), 0) : null;
  const history = ready?.data.history;
  const currency = ready?.data.currency ?? 'EUR';
  const minute = ready ? Math.floor(ready.now / 60_000) : 0;
  useEffect(() => {
    if (netCents === null || !history) return;
    writeWidget(widgetPayload({ netCents, todayCents, points: history, currency, hidden: hideAmounts, available, now: minute * 60_000 }));
  }, [netCents, todayCents, history, currency, hideAmounts, available, minute]);
  return null;
}

/** Signing out leaves nothing personal on the home screen. */
export function clearWidget() { writeWidget(null); }
