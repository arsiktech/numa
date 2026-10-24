import { ConvexError } from 'convex/values';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/** What came back from Google. The server adds one of these words to the return address. */
export type GoogleLinkResult = 'linked' | 'already' | 'taken' | 'cancelled' | 'expired' | 'failed';
const RESULTS = new Set<GoogleLinkResult>(['linked', 'already', 'taken', 'cancelled', 'expired', 'failed']);

export type StartGoogleLink = (args: { returnTo: string }) => Promise<{ url: string }>;

export function parseGoogleLinkResult(value: unknown): GoogleLinkResult | null {
  return typeof value === 'string' && RESULTS.has(value as GoogleLinkResult) ? (value as GoogleLinkResult) : null;
}

/**
 * Adds a Google account to the signed-in account. On phones Google opens in the system sign-in
 * sheet and the result comes straight back. On the web the page goes to Google and returns to
 * Settings with the result in the address; Settings shows it ('leaving' until then).
 * Throws a ConvexError with code REAUTH_REQUIRED when the session is too old to add a method.
 */
export async function linkGoogle(start: StartGoogleLink): Promise<GoogleLinkResult | 'leaving'> {
  if (Platform.OS === 'web') {
    const { url } = await start({ returnTo: `${window.location.origin}/settings` });
    window.location.assign(url);
    return 'leaving';
  }
  const returnTo = Linking.createURL('auth');
  const { url } = await start({ returnTo });
  const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
  if (result.type !== 'success') return 'cancelled';
  return parseGoogleLinkResult(new URL(result.url).searchParams.get('googleLink')) ?? 'failed';
}

/** One plain sentence for each outcome, or null when nothing needs saying. */
export function googleLinkText(result: GoogleLinkResult): string | null {
  switch (result) {
    case 'linked': return 'Google added. You can now sign in with it on any device.';
    case 'already': return 'That Google account is already linked to this account.';
    case 'taken': return 'That Google account already has its own Numa Pro account, so it can’t be added here. Sign in with it to use that account, or pick another Google account.';
    case 'cancelled': return null;
    case 'expired': return 'That took too long. Try Add Google again.';
    case 'failed': return 'Couldn’t add Google. Try again.';
  }
}

export function needsFreshSignIn(error: unknown): boolean {
  return error instanceof ConvexError && (error.data as { code?: string } | undefined)?.code === 'REAUTH_REQUIRED';
}

/** The server's own sentence for a refused change, never internals. */
export function signInMethodErrorText(error: unknown): string {
  if (error instanceof ConvexError && error.data && typeof error.data === 'object') {
    const { code, message } = error.data as { code?: string; message?: string };
    if (code && ['LAST_METHOD', 'NOT_REMOVABLE', 'NOT_FOUND', 'GOOGLE_UNAVAILABLE'].includes(code) && message) return message;
  }
  return 'Couldn’t reach Numa. Check your connection and try again.';
}
