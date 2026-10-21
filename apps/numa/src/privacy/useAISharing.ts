import { useConvex, useMutation, useQuery } from 'convex/react';
import { cloud, type AISharingStatus } from '@/cloud/api';
import { newMutationId } from '@/data/cloud';

export type AISharingControls = { state: AISharingStatus | undefined; read: () => Promise<AISharingStatus>; change: (allowed: boolean) => Promise<AISharingStatus> };
export function useAISharing(): AISharingControls {
  const state = useQuery(cloud.aiSharing, {});
  const set = useMutation(cloud.setAISharing);
  const convex = useConvex();
  const read = () => convex.query(cloud.aiSharing, {});
  return { state, read, change: async allowed => {
    if (!state?.userId) throw new Error('Account unavailable');
    const expectedUserId = state.userId;
    await set({ expectedUserId, allowed, version: state.requiredVersion, clientMutationId: newMutationId('privacy.setAISharing') });
    const current = await read();
    if (current.userId !== expectedUserId || (allowed && !current.allowed) || (!allowed && (current.granted || current.allowed))) throw new Error('Sharing choice could not be confirmed');
    return current;
  } };
}
