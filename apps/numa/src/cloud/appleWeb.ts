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

type AppleIdResponse = { authorization?: { id_token?: string; code?: string }; user?: { name?: { firstName?: string; lastName?: string } } };
type AppleIdApi = { auth: { init: (config: Record<string, unknown>) => void; signIn: () => Promise<AppleIdResponse> } };

/** True where Apple's popup can come back to this page. Tests can force it with `?appleweb=1`. */
export function appleWebAvailable(location: { hostname: string; search: string } | undefined = globalThis.location): boolean {
  if (!location) return false;
  return APPLE_WEB_HOSTS.includes(location.hostname) || new URLSearchParams(location.search).get('appleweb') === '1';
}

let loading: Promise<AppleIdApi> | null = null;
/** Warm the SDK while the form is visible, instead of spending the click's popup permission on a download. */
export function prepareAppleWebSignIn(): Promise<AppleIdApi> {
  const ready = (globalThis as { AppleID?: AppleIdApi }).AppleID;
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  const pending = new Promise<AppleIdApi>((resolve, reject) => {
    const tag = document.createElement('script');
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); tag.remove();
      reject(new Error('Apple sign-in did not load. Try again or use email.'));
    };
    const timer = setTimeout(fail, 8000);
    tag.src = SCRIPT; tag.async = true;
    tag.onload = () => {
      if (settled) return;
      const api = (globalThis as { AppleID?: AppleIdApi }).AppleID;
      if (!api) { fail(); return; }
      settled = true; clearTimeout(timer); resolve(api);
    };
    tag.onerror = fail;
    document.head.appendChild(tag);
  });
  loading = pending;
  void pending.catch(() => { if (loading === pending) loading = null; });
  return pending;
}

/** Cancelling ignores a late provider response, so it cannot create an unexpected app session. */
function popupResponse(api: AppleIdApi, signal?: AbortSignal): Promise<AppleIdResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('cancelled')); return; }
    const cancel = () => { cleanup(); reject(new Error('cancelled')); };
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Apple sign-in took too long. Try again or use email.')); }, 120000);
    signal?.addEventListener('abort', cancel, { once: true });
    try { api.auth.signIn().then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); }); }
    catch (error) { cleanup(); reject(error); }
  });
}

export type AppleWebResult = { identityToken: string; authorizationCode: string; redirectURI: string; name: string } | 'cancelled';

/** Opens Apple's popup. `hashedNonce` goes into Apple's token; the caller sends the raw nonce to the server. */
export async function appleWebSignIn(hashedNonce: string, signal?: AbortSignal): Promise<AppleWebResult> {
  const api = await prepareAppleWebSignIn();
  if (signal?.aborted) return 'cancelled';
  api.auth.init({ clientId: APPLE_WEB_CLIENT_ID, scope: 'name email', responseType: 'code id_token', redirectURI: `${window.location.origin}`, usePopup: true, nonce: hashedNonce });
  let response: AppleIdResponse;
  try {
    response = await popupResponse(api, signal);
  } catch (e) {
    if (e instanceof Error && e.message === 'cancelled') return 'cancelled';
    const code = (e as { error?: string }).error;
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') return 'cancelled';
    throw new Error(code ?? 'Apple sign-in failed');
  }
  const identityToken = response.authorization?.id_token;
  if (!identityToken) throw new Error('No identity token');
  const authorizationCode = response.authorization?.code;
  if (!authorizationCode) throw new Error('No authorization code');
  // Apple shares the name only the first time, and only here, never in the token.
  const name = [response.user?.name?.firstName, response.user?.name?.lastName].filter(Boolean).join(' ');
  return { identityToken, authorizationCode, redirectURI: window.location.origin, name };
}
