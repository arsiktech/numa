import { authTarget } from './authTarget';

describe('authTarget', () => {
  it('sends the web return to sign-in and a signed-in person home', () => {
    expect(authTarget('web', false)).toBe('/sign-in');
    expect(authTarget('web', true)).toBe('/');
    expect(authTarget('ios', false)).toBe('/');
  });
});
