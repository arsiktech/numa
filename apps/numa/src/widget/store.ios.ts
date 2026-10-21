import { ExtensionStorage } from '@bacons/apple-targets';

import type { WidgetPayload } from './payload';

const shared = new ExtensionStorage('group.com.arsiktech.numa');

export function writeWidget(payload: WidgetPayload | null): boolean {
  // Remove the previous payload first, including when a new serialization/write fails.
  // Reload is separate so failure to request a timeline cannot undo a successful storage clear.
  let written = false;
  try {
    shared.set('numa.widget', undefined);
    if (payload) shared.set('numa.widget', JSON.stringify(payload));
    written = true;
  } catch {
    try { shared.set('numa.widget', undefined); } catch { /* OS storage unavailable; caller cannot repair it. */ }
  }
  try { ExtensionStorage.reloadWidget(); } catch { /* WidgetKit decides the next reload opportunity. */ }
  return written;
}
