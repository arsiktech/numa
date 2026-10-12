import { ExtensionStorage } from '@bacons/apple-targets';

import type { WidgetPayload } from './payload';

/** Shared with the widget extension through the app group in app.json. */
const shared = new ExtensionStorage('group.com.arsiktech.numa');

export function writeWidget(payload: WidgetPayload | null) {
  try {
    shared.set('numa.widget', payload ? JSON.stringify(payload) : undefined);
    ExtensionStorage.reloadWidget();
  } catch { /* the widget keeps its last state */ }
}
