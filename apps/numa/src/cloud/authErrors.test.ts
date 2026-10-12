import { authErrorText } from './authErrors';

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
