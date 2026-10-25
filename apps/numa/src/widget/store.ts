import type { WidgetPayload } from './payload';

/** Native widgets are iOS-only; web and other platforms have no shared widget storage. */
export function writeWidget(_payload: WidgetPayload | null): boolean { return true; }
