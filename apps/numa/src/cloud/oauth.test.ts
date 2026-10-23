import { appleWebSignIn } from './appleWeb';
import { continueWithApple } from './oauth';
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.create(actual, { Platform: { value: { ...actual.Platform, OS: 'web' } } });
});
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture', digestStringAsync: async () => 'hash', CryptoDigestAlgorithm: { SHA256: 'SHA256' } }));
jest.mock('expo-linking', () => ({}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('./appleWeb', () => ({ appleWebAvailable: () => true, appleWebSignIn: jest.fn() }));
const popup = jest.mocked(appleWebSignIn);
beforeEach(() => jest.clearAllMocks());
it('does not exchange a token after the popup attempt was cancelled', async () => {
  const controller = new AbortController();
  popup.mockImplementation(async () => { controller.abort(); return { identityToken: 'fixture-token', authorizationCode: 'fixture-code', redirectURI: 'https://numaworth.com', name: '' }; });
  const signIn = jest.fn();
  expect(await continueWithApple(signIn, controller.signal)).toBe('cancelled');
  expect(signIn).not.toHaveBeenCalled();
});
it('locks the exchange phase synchronously before a session-mutating sign-in', async () => {
  popup.mockResolvedValue({ identityToken: 'fixture-token', authorizationCode: 'fixture-code', redirectURI: 'https://numaworth.com', name: '' });
  let phase = 'popup';
  let finish: (v: { signingIn: boolean }) => void = () => {};
  const signIn = jest.fn(() => {
    expect(phase).toBe('exchange');
    return new Promise<{ signingIn: boolean }>((resolve) => { finish = resolve; });
  });
  const pending = continueWithApple(signIn, new AbortController().signal, () => { phase = 'exchange'; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(phase).toBe('exchange');
  finish({ signingIn: true });
  expect(await pending).toBe('signedIn');
});

it('forwards the web authorization code for server-side exchange', async () => {
  popup.mockResolvedValue({ identityToken: 'fixture-token', authorizationCode: 'fixture-code', redirectURI: 'https://numaworth.com', name: '' });
  const signIn = jest.fn(async () => ({ signingIn: true }));
  await continueWithApple(signIn);
  expect(signIn).toHaveBeenCalledWith('apple-native', expect.objectContaining({ authorizationCode: 'fixture-code' }));
});
