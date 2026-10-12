import { ConvexError } from 'convex/values';
import { authErrorText, isAuthGone, passwordErrorText } from './authErrors';

describe('authErrorText', () => {
  it('never echoes server internals on sign-in', () => {
    expect(authErrorText(new Error('[CONVEX A(auth:signIn)] InvalidSecret at handler'), 'signIn')).toBe('That email and password don’t match.');
  });
  it('passes a password rule through on sign-up', () => {
    expect(authErrorText(new Error('Uncaught Error: Use at least 10 characters. at authorize'), 'signUp')).toBe('Use at least 10 characters.');
  });
  it('explains rate limits', () => {
    expect(authErrorText(new Error('TooManyFailedAttempts'), 'signIn')).toMatch(/Too many tries/);
  });
});

describe('passwordErrorText', () => {
  it('shows the server’s own plain message for known codes', () => {
    expect(passwordErrorText(new ConvexError({ code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.' }))).toBe('Current password is incorrect.');
    expect(passwordErrorText(new ConvexError({ code: 'WEAK_PASSWORD', message: 'Use at least 10 characters.' }))).toBe('Use at least 10 characters.');
  });
  it('never echoes anything else', () => {
    expect(passwordErrorText(new ConvexError({ code: 'INTERNAL', message: 'stack at x' }))).toMatch(/^Couldn’t change the password/);
    expect(passwordErrorText(new Error('Server Error'))).toMatch(/^Couldn’t change the password/);
  });
});

describe('isAuthGone', () => {
  it('spots a session the server no longer accepts', () => {
    expect(isAuthGone(new Error('[CONVEX Q(spaces:listMine)] Uncaught ConvexError: {"code":"UNAUTHENTICATED","message":"Account no longer exists. Sign in again."}'))).toBe(true);
    expect(isAuthGone(new Error('Server Error'))).toBe(false);
  });
});
