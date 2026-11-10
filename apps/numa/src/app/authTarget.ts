/** Where /auth sends the person. The web return finishes on the sign-in screen. */
export function authTarget(os: string, signedIn: boolean): '/sign-in' | '/' {
  if (signedIn) return '/';
  return os === 'web' ? '/sign-in' : '/';
}
