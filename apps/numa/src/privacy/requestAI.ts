import type { AISharingStatus, AskReply, AskTurn } from '@/cloud/api';

type Request = { expectedUserId: string; message: string; history: AskTurn[];
  readPermission: () => Promise<AISharingStatus>; buildContext: () => string;
  stillCurrent: () => boolean;
  submit: (args: { expectedUserId: string; message: string; history: AskTurn[]; context: string }) => Promise<AskReply>;
};

/** Build and send the sensitive context only after a fresh, same-account decision. Server authorization remains authoritative. */
export async function requestPrivateAI(request: Request): Promise<AskReply> {
  if (!request.stillCurrent()) return { status: 'declined', reason: 'account-unavailable' };
  const permission = await request.readPermission();
  if (!request.stillCurrent() || permission.userId !== request.expectedUserId) return { status: 'declined', reason: 'account-unavailable' };
  if (permission.deletionPending || !permission.allowed) return { status: 'declined', reason: permission.deletionPending ? 'deletion-pending' : 'permission-required' };
  return request.submit({ expectedUserId: request.expectedUserId, message: request.message, history: request.history, context: request.buildContext() });
}
