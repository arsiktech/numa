import { ConvexError } from 'convex/values';

/** Turns a Convex Auth failure into one plain sentence. Never echoes server internals. */
export function authErrorText(error: unknown, flow: 'signIn' | 'signUp' | 'email-verification'): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/TooManyFailedAttempts|rate limit/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  if (flow === 'email-verification') return 'That code didn’t work. Check the latest email and try again.';
  if (flow === 'signIn') return 'That email and password don’t match.';
  const policy = [
    'Use at least 10 characters.',
    'Use at least 3 of: uppercase, lowercase, number, symbol.',
    'Avoid common or easily guessed passwords.',
    'Avoid long repeated characters.',
    'Avoid obvious sequences like 123456 or qwerty.',
    'Do not include your email or name.',
  ].find((m) => message.includes(m));
  if (policy) return policy;
  if (/already exists|AccountAlreadyExists/i.test(message)) return 'There’s already an account for this email. Sign in instead.';
  return 'Couldn’t create the account. Check the email and try a stronger password.';
}

const PLAIN = new Set(['INVALID_CURRENT_PASSWORD', 'WEAK_PASSWORD', 'SAME_PASSWORD', 'PASSWORD_NOT_AVAILABLE', 'ALREADY_SET', 'EMAIL_TAKEN', 'NO_EMAIL']);

/** One plain sentence for a failed change. Only the server's own user-facing messages are shown. */
export function passwordErrorText(e: unknown): string {
  if (e instanceof ConvexError && e.data && typeof e.data === 'object') {
    const { code, message } = e.data as { code?: string; message?: string };
    if (code && PLAIN.has(code) && message) return message;
  }
  return 'Couldn’t change the password. Check your connection and try again.';
}

/** True when the server no longer accepts this session: signed out elsewhere, or the account was erased. */
export function isAuthGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /UNAUTHENTICATED|Account no longer exists|Not signed in|USER_NOT_INITIALISED/.test(message);
}

/** One plain sentence for a failed password reset step. */
export function resetErrorText(error: unknown, step: 'resetEmail' | 'resetCode'): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/reset is not enabled/i.test(message)) return 'Password reset isn’t switched on yet. Try again later.';
  if (/TooManyFailedAttempts|rate limit/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  if (step === 'resetEmail') return 'Couldn’t send a code. Check your connection and try again.';
  const policy = authErrorText(error, 'signUp');
  if (!policy.startsWith('Couldn’t create') && !policy.startsWith('There’s already')) return policy;
  return 'That code didn’t work, or it has expired. Ask for a new one and try again.';
}
