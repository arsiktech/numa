import type { WidgetPayload } from './payload';
import { writeWidget } from './store';

let active: symbol | null = null;

/** A mounted writer owns its cleanup. An old unmount cannot erase a newer writer's data. */
export function claimWidgetWriter() {
  const token = Symbol('widget writer');
  active = token;
  let owner: string | null = null;
  let previous: string | null = null;
  writeWidget(null);
  return {
    publish(nextOwner: string | null, payload: WidgetPayload | null) {
      if (active !== token) return;
      if (!nextOwner || !payload) {
        owner = null;
        previous = null;
        writeWidget(null);
        return;
      }
      if (owner !== nextOwner) {
        writeWidget(null);
        owner = nextOwner;
        previous = null;
      }
      const serialized = JSON.stringify(payload);
      if (serialized !== previous) {
        if (writeWidget(payload)) previous = serialized;
      }
    },
    release() {
      if (active !== token) return;
      active = null;
      writeWidget(null);
    },
  };
}

/** Called by the existing root sign-out effect; no call-site change is needed. */
export function clearWidget() {
  active = null;
  writeWidget(null);
}
