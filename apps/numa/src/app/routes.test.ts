import { isKnownPath, routeMeta } from './routes';

describe('routes', () => {
  it('treats unknown addresses as not part of the app', () => {
    expect(isKnownPath('/not-a-route')).toBe(false);
    expect(isKnownPath('/sign-in')).toBe(true);
    expect(isKnownPath('/')).toBe(true);
  });

  it('gives the main screens their own titles', () => {
    expect(routeMeta('/sign-in').title).toBe('Sign in');
    expect(routeMeta('/flow').title).toBe('Flow');
    expect(routeMeta('/nope').title).toBe('Page not found');
  });
});