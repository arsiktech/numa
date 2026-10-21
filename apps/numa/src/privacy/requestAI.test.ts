import { requestPrivateAI } from './requestAI';
import type { AISharingStatus } from '@/cloud/api';

function permission(patch: Partial<AISharingStatus> = {}): AISharingStatus {
  return { userId: 'user', requiredVersion: 'current', allowed: true, granted: true, decidedAt: 1, deletionPending: false, deletionStarted: false, reason: null,
    disclosure: { title: '', data: '', recipients: '', purpose: '', retention: '', withdrawal: '', alternative: '', links: [] }, ...patch };
}
function request(p = permission()) {
  return { expectedUserId: 'user', message: 'Synthetic question', history: [], stillCurrent: jest.fn(() => true),
    readPermission: jest.fn(async () => p), buildContext: jest.fn(() => 'Synthetic private context'),
    submit: jest.fn(async () => ({ status: 'ok' as const, text: 'Synthetic reply', proposals: [] })) };
}

describe('pre-transmission AI client boundary', () => {
  it('builds and submits context only for a fresh same-account grant', async () => {
    const r = request(); expect(await requestPrivateAI(r)).toMatchObject({ status: 'ok' });
    expect(r.readPermission).toHaveBeenCalledTimes(1); expect(r.buildContext).toHaveBeenCalledTimes(1);
    expect(r.submit).toHaveBeenCalledWith({ expectedUserId: 'user', message: 'Synthetic question', history: [], context: 'Synthetic private context' });
  });
  it.each([
    ['withdrawn or stale', { allowed: false, granted: false }, 'permission-required'],
    ['deleting', { deletionPending: true }, 'deletion-pending'],
    ['missing account', { userId: null }, 'account-unavailable'],
    ['different account', { userId: 'other' }, 'account-unavailable'],
  ] as const)('does not even build context for %s', async (_name, patch, reason) => {
    const r = request(permission(patch)); expect(await requestPrivateAI(r)).toEqual({ status: 'declined', reason });
    expect(r.buildContext).not.toHaveBeenCalled(); expect(r.submit).not.toHaveBeenCalled();
  });
  it('does not start after the view or selected space changes', async () => {
    const r = request(); r.stillCurrent.mockReturnValue(false);
    expect(await requestPrivateAI(r)).toMatchObject({ status: 'declined' });
    expect(r.readPermission).not.toHaveBeenCalled(); expect(r.submit).not.toHaveBeenCalled();
  });
  it('drops a pending permission response after the view or account changes', async () => {
    let resolve!: (p: AISharingStatus) => void; const r = request();
    r.readPermission.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = requestPrivateAI(r); r.stillCurrent.mockReturnValue(false); resolve(permission());
    expect(await pending).toMatchObject({ status: 'declined', reason: 'account-unavailable' });
    expect(r.buildContext).not.toHaveBeenCalled(); expect(r.submit).not.toHaveBeenCalled();
  });
  it('does not send when the permission read fails', async () => {
    const r = request(); r.readPermission.mockRejectedValueOnce(new Error('offline'));
    await expect(requestPrivateAI(r)).rejects.toThrow('offline');
    expect(r.buildContext).not.toHaveBeenCalled(); expect(r.submit).not.toHaveBeenCalled();
  });
});
