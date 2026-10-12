import { makeClientMutationId } from "@/services/writeQueue";

export interface AiAuditAttemptState {
  draftId?: string;
  createRequestId?: string;
}

export function stableClientMutationId(
  ids: Map<string, string>,
  key: string,
  operation: string
) {
  const existing = ids.get(key);
  if (existing) return existing;
  const created = makeClientMutationId(operation);
  ids.set(key, created);
  return created;
}

function recoveredConfirmedResult<T>(auditResult: unknown): T | undefined {
  if (
    auditResult &&
    typeof auditResult === "object" &&
    "status" in auditResult &&
    auditResult.status === "confirmed" &&
    "resultId" in auditResult &&
    typeof auditResult.resultId === "string"
  ) {
    return { id: auditResult.resultId, queued: false, recovered: true } as T;
  }
  return undefined;
}

export async function executeConfirmedAiAction<T>({
  cloudEnabled,
  cloudBacked,
  draftId,
  execute,
  markFailed
}: {
  cloudEnabled: boolean;
  cloudBacked: boolean;
  draftId: string | undefined;
  clientMutationId: string;
  execute: (auditDraftId?: string) => Promise<T>;
  markFailed: (draftId: string, error: string) => Promise<unknown>;
}) {
  if (!cloudEnabled) return await execute(undefined);
  if (!cloudBacked || !draftId) {
    throw new Error("The cloud audit record is not ready. Try again in a moment.");
  }

  try {
    return await execute(draftId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const auditResult = await markFailed(draftId, message);
      const recovered = recoveredConfirmedResult<T>(auditResult);
      if (recovered) return recovered;
    } catch (auditError) {
      console.warn("[numa] could not record the AI audit failure:", auditError);
      throw error;
    }
    throw error;
  }
}

export function toAiAuditPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toAiAuditPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toAiAuditPayload(item)])
    );
  }
  return value;
}

export async function createAndExecuteConfirmedAiAction<T>({
  cloudEnabled,
  cloudBacked,
  clientMutationId,
  createDraft,
  execute,
  markFailed,
  attemptState
}: {
  cloudEnabled: boolean;
  cloudBacked: boolean;
  clientMutationId: string;
  createDraft: (createRequestId: string) => Promise<string>;
  execute: (auditDraftId?: string) => Promise<T>;
  markFailed: (draftId: string, error: string) => Promise<unknown>;
  attemptState?: AiAuditAttemptState;
}) {
  if (!cloudEnabled) return await execute(undefined);
  if (!cloudBacked) {
    throw new Error("The cloud money context is still syncing. Try again in a moment.");
  }
  const createRequestId = attemptState?.createRequestId ?? `audit:${clientMutationId}`;
  if (attemptState && !attemptState.createRequestId) {
    // Persist before the await: if the server insert commits but its response
    // is lost, the next tap must recover that same draft.
    attemptState.createRequestId = createRequestId;
  }
  const draftId = attemptState?.draftId ?? await createDraft(createRequestId);
  if (attemptState && !attemptState.draftId) attemptState.draftId = draftId;
  try {
    return await execute(draftId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const auditResult = await markFailed(draftId, message);
      const recovered = recoveredConfirmedResult<T>(auditResult);
      if (recovered) return recovered;
      if (
        attemptState &&
        (!auditResult ||
          typeof auditResult !== "object" ||
          !("status" in auditResult) ||
          auditResult.status === "failed")
      ) {
        attemptState.draftId = undefined;
        attemptState.createRequestId = makeClientMutationId("aiActions.createDraft");
      }
    } catch (auditError) {
      console.warn("[numa] could not record the AI audit failure:", auditError);
      throw error;
    }
    throw error;
  }
}
