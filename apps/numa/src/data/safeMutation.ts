import { useConvex, useMutation } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { useCallback } from 'react';

import { newMutationId, useOptionalCloudData } from './cloud';
import { offlineWriteError, sharedWriteIntents, staleWriteError } from './writeIntent';

type Receipted = { clientMutationId: string };

/**
 * A Convex write that isn't one of Ask's operations, with the writer's guarantees: refused while offline
 * instead of queued, and one receipt per intent for the signed-in account, so a second tap or a retry
 * after an unclear failure counts once on the server. A caller that already holds a request id passes it.
 */
export function useSafeMutation<Args extends Receipted, R>(ref: FunctionReference<'mutation', 'public', Args, R>, name: string) {
  const mutate = useMutation(ref) as unknown as (args: Args) => Promise<R>;
  const convex = useConvex();
  const data = useOptionalCloudData();
  const userId = data?.status === 'ready' ? data.boot.profile.userId : null;
  return useCallback(async (args: Omit<Args, 'clientMutationId'> & { clientMutationId?: string }): Promise<R> => {
    if (!userId) throw staleWriteError();
    if (!convex.connectionState().isWebSocketConnected) throw offlineWriteError();
    const { clientMutationId, ...rest } = args;
    return sharedWriteIntents(userId, newMutationId)(
      { fn: name, args: rest },
      (receipt) => mutate({ ...rest, clientMutationId: receipt } as unknown as Args),
      clientMutationId,
    );
  }, [userId, convex, mutate, name]);
}
