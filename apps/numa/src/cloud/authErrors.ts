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
