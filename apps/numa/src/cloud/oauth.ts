import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

type SignIn = (provider: string, params?: Record<string, string>) => Promise<{ signingIn: boolean; redirect?: URL }>;
export type OAuthOutcome = 'signedIn' | 'cancelled' | 'leaving';

/**
 * Continue with Google. On web the page goes to Google and comes back with a code, which
 * Convex Auth finishes on load. On phones the system browser sheet opens and hands the code
 * back to the app through its own URL scheme; the sign-in is finished here.
 */
export async function continueWithGoogle(signIn: SignIn): Promise<OAuthOutcome> {
  if (Platform.OS === 'web') {
    await signIn('google', { redirectTo: `${window.location.origin}/` });
    return 'leaving';
  }
  const redirectTo = Linking.createURL('auth');
  const { redirect } = await signIn('google', { redirectTo });
  if (!redirect) throw new Error('No sign-in page');
  const result = await WebBrowser.openAuthSessionAsync(redirect.toString(), redirectTo);
  if (result.type !== 'success') return 'cancelled';
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('No code');
  const done = await signIn('google', { code });
  return done.signingIn ? 'signedIn' : 'cancelled';
}

/** True on iPhones that can show Apple's own sign-in sheet. */
export async function appleSignInAvailable(): Promise<boolean> {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync().catch(() => false));
}

/**
 * Sign in with Apple through the system sheet. A one-time nonce is hashed into Apple's token
 * and the raw value goes to the server, which checks that the two match.
 */
export async function continueWithApple(signIn: SignIn): Promise<OAuthOutcome> {
  const nonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new Error('No identity token');
  // Apple shares the name only the first time; it is never in the token itself.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  const done = await signIn('apple-native', { identityToken: credential.identityToken, nonce, ...(name ? { name } : {}) });
  return done.signingIn ? 'signedIn' : 'cancelled';
}
