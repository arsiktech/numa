import * as Apple from 'expo-apple-authentication';
import { continueWithApple } from './oauth';
jest.mock('react-native', () => { const actual = jest.requireActual('react-native'); return Object.create(actual, { Platform: { value: { ...actual.Platform, OS: 'ios' } } }); });
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture', digestStringAsync: async () => 'hash', CryptoDigestAlgorithm: { SHA256: 'SHA256' } }));
jest.mock('expo-linking', () => ({})); jest.mock('expo-web-browser', () => ({}));
it('forwards native authorization code and locks exchange before session creation', async () => {
  jest.mocked(Apple.signInAsync).mockResolvedValue({ identityToken: 'dummy-token', authorizationCode: 'dummy-code', fullName: null } as Apple.AppleAuthenticationCredential);
  let phase = 'popup';
  const signIn = jest.fn(async () => { expect(phase).toBe('exchange'); return { signingIn: true }; });
  expect(await continueWithApple(signIn, undefined, () => { phase = 'exchange'; })).toBe('signedIn');
  expect(signIn).toHaveBeenCalledWith('apple-native', expect.objectContaining({ authorizationCode: 'dummy-code' }));
});
it('refuses a missing native authorization code and a canceled native exchange', async () => {
  jest.mocked(Apple.signInAsync).mockResolvedValue({ identityToken: 'dummy-token', authorizationCode: null } as Apple.AppleAuthenticationCredential);
  const signIn = jest.fn();
  await expect(continueWithApple(signIn)).rejects.toThrow(/authorization code/);
  expect(signIn).not.toHaveBeenCalled();
  const controller = new AbortController();
  jest.mocked(Apple.signInAsync).mockImplementation(async () => { controller.abort(); return { identityToken: 'dummy-token', authorizationCode: 'dummy-code' } as Apple.AppleAuthenticationCredential; });
  expect(await continueWithApple(signIn, controller.signal)).toBe('cancelled');
  expect(signIn).not.toHaveBeenCalled();
});
