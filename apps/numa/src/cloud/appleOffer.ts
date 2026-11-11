export type AppleOffer = 'hidden' | 'checking' | 'ready' | 'unavailable';

/** What the sign-in screen should do with Apple. A hung or dropped socket must not wait forever. */
export function appleOffer(input: { hostAvailable: boolean; configured: boolean | undefined; connected: boolean; retries: number; timedOut: boolean }): AppleOffer {
  if (!input.hostAvailable) return 'hidden';
  if (input.configured === true) return 'ready';
  if (input.configured === false || input.timedOut || (!input.connected && input.retries > 0)) return 'unavailable';
  return 'checking';
}
