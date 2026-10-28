import type { Op } from './plan';

/** Frozen before transport and retained on an ambiguous failure, including across a native reopen. */
export type DraftSaveIntent = { contextKey: string; clientMutationId: string; apply: Op; undo: Op };
