/**
 * Sign in with Apple on the web, through Apple's own popup. Apple returns the same kind of identity
 * token as on iPhone, issued for the web Services ID, and the server checks it the same way, so the
 * same Apple ID reaches the same account on every device.
 */

/** The Services ID registered with Apple for numaworth.com. Not a secret. */
export const APPLE_WEB_CLIENT_ID = 'com.arsiktech.numa.web';

/** Apple only returns to addresses registered on the Services ID; previews on other hosts can't use it. */
const APPLE_WEB_HOSTS = ['numaworth.com', 'www.numaworth.com', 'numa-pro.pages.dev'];

const SCRIPT = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

type AppleIdResponse = { authorization?: { id_token?: string }; user?: { name?: { firstName?: string; lastName?: string } } };
type AppleIdApi = { auth: { init: (config: Record<string, unknown>) => void; signIn: () => Promise<AppleIdResponse> } };

/** True where Apple's popup can come back to this page. Tests can force it with `?appleweb=1`. */
export function appleWebAvailable(location: { hostname: string; search: string } | undefined = globalThis.location): boolean {
  if (!location) return false;
  return APPLE_WEB_HOSTS.includes(location.hostname) || new URLSearchParams(location.search).get('appleweb') === '1';
}

let loading: Promise<AppleIdApi> | null = null;
function appleId(): Promise<AppleIdApi> {
  const ready = (globalThis as { AppleID?: AppleIdApi }).AppleID;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<AppleIdApi>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => { const api = (globalThis as { AppleID?: AppleIdApi }).AppleID; if (api) resolve(api); else reject(new Error('Apple sign-in did not load')); };
    tag.onerror = () => { loading = null; reject(new Error('Apple sign-in did not load')); };
    document.head.appendChild(tag);
  });
  return loading;
}

export type AppleWebResult = { identityToken: string; name: string } | 'cancelled';

/** Opens Apple's popup. `hashedNonce` goes into Apple's token; the caller sends the raw nonce to the server. */
export async function appleWebSignIn(hashedNonce: string): Promise<AppleWebResult> {
  const api = await appleId();
  api.auth.init({ clientId: APPLE_WEB_CLIENT_ID, scope: 'name email', redirectURI: `${window.location.origin}`, usePopup: true, nonce: hashedNonce });
  let response: AppleIdResponse;
  try {
    response = await api.auth.signIn();
  } catch (e) {
    const code = (e as { error?: string }).error;
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') return 'cancelled';
    throw new Error(code ?? 'Apple sign-in failed');
  }
  const identityToken = response.authorization?.id_token;
  if (!identityToken) throw new Error('No identity token');
  // Apple shares the name only the first time, and only here, never in the token.
  const name = [response.user?.name?.firstName, response.user?.name?.lastName].filter(Boolean).join(' ');
  return { identityToken, name };
}
