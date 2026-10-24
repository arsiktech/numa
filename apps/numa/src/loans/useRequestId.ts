import { useState } from 'react';

import { newMutationId } from '@/data/cloud';

/**
 * One request id for one set of inputs, for as long as the form is open: the same inputs always give
 * the same id, so a second tap, or a retry after a save that may or may not have gone through, counts
 * once, even after editing and changing back. Different inputs give a different id.
 */
export function useRequestId(key: string, prefix: string): string {
  // One map for the life of the form. Filling it during render is safe: a key always gets the same id.
  const [ids] = useState(() => new Map<string, string>());
  let id = ids.get(key);
  if (id === undefined) {
    id = newMutationId(prefix);
    ids.set(key, id);
  }
  return id;
}
