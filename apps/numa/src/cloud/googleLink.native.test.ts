import { ConvexError } from 'convex/values';
import * as WebBrowser from 'expo-web-browser';

import { googleLinkText, linkGoogle, needsFreshSignIn, parseGoogleLinkResult, signInMethodErrorText } from './googleLink';

jest.mock('react-native', () => { const actual = jest.requireActual('react-native'); return Object.create(actual, { Platform: { value: { ...actual.Platform, OS: 'ios' } } }); });
jest.mock('expo-linking', () => ({ createURL: (path: string) => `numa://${path}` }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(), WebBrowserResultType: { CANCEL: 'cancel' } }));
const sheet = jest.mocked(WebBrowser.openAuthSessionAsync);
beforeEach(() => jest.clearAllMocks());

it('opens the start link in the sign-in sheet and reads the result the server sent back', async () => {
  const start = jest.fn(async () => ({ url: 'https://numa.convex.site/link/google/start?t=x' }));
  sheet.mockResolvedValue({ type: 'success', url: 'numa://auth?googleLink=linked' });
  expect(await linkGoogle(start)).toBe('linked');
  expect(start).toHaveBeenCalledWith({ returnTo: 'numa://auth' });
  expect(sheet).toHaveBeenCalledWith('https://numa.convex.site/link/google/start?t=x', 'numa://auth');
});

it('treats a closed sheet as cancelled and an unknown answer as a failure', async () => {
  const start = jest.fn(async () => ({ url: 'https://x' }));
  sheet.mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
  expect(await linkGoogle(start)).toBe('cancelled');
  sheet.mockResolvedValue({ type: 'success', url: 'numa://auth?googleLink=<script>' });
  expect(await linkGoogle(start)).toBe('failed');
});

it('asks for a fresh sign-in before opening anything when the server says the session is old', async () => {
  const start = jest.fn(async () => { throw new ConvexError({ code: 'REAUTH_REQUIRED', message: 'Confirm it’s you first, then add Google.' }); });
  const error = await linkGoogle(start).catch((e) => e);
  expect(needsFreshSignIn(error)).toBe(true);
  expect(sheet).not.toHaveBeenCalled();
});

it('has a plain sentence for every outcome and shows only the server’s own refusal messages', () => {
  expect(parseGoogleLinkResult('taken')).toBe('taken');
  expect(parseGoogleLinkResult(['linked'])).toBeNull();
  expect(googleLinkText('taken')).toMatch(/already has its own Numa Pro account/);
  expect(googleLinkText('cancelled')).toBeNull();
  expect(signInMethodErrorText(new ConvexError({ code: 'LAST_METHOD', message: 'This is your only way to sign in, so it can’t be removed.' }))).toMatch(/only way/);
  expect(signInMethodErrorText(new Error('internal stack'))).toMatch(/Couldn’t reach Numa/);
});
