import { appleOffer } from './appleOffer';

describe('appleOffer', () => {
  it('stays hidden when this device cannot show Apple sign-in', () => {
    expect(appleOffer({ hostAvailable: false, configured: undefined, connected: false, retries: 3, timedOut: true })).toBe('hidden');
  });

  it('shows Apple when the server says it is configured', () => {
    expect(appleOffer({ hostAvailable: true, configured: true, connected: true, retries: 0, timedOut: false })).toBe('ready');
  });

  it('stops checking when the socket drops or the query never returns, and leaves email as the way in', () => {
    expect(appleOffer({ hostAvailable: true, configured: undefined, connected: false, retries: 1, timedOut: false })).toBe('unavailable');
    expect(appleOffer({ hostAvailable: true, configured: undefined, connected: true, retries: 0, timedOut: true })).toBe('unavailable');
    expect(appleOffer({ hostAvailable: true, configured: false, connected: true, retries: 0, timedOut: false })).toBe('unavailable');
  });

  it('keeps checking while the first connection is still opening', () => {
    expect(appleOffer({ hostAvailable: true, configured: undefined, connected: false, retries: 0, timedOut: false })).toBe('checking');
  });
});
