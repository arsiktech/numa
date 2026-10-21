import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Platform, View } from 'react-native';

import SignIn from '@/app/sign-in';

let mockConfigured: boolean | undefined = false;
let mockAvailable = true;
let mockGoogle = false;
const mockPrepare = jest.fn(async () => undefined);
const mockSet = jest.fn();

jest.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: jest.fn() }) }));
jest.mock('convex/react', () => ({ useQuery: (reference: string) => reference === 'apple-readiness' ? (mockConfigured === undefined ? undefined : { configured: mockConfigured }) : { googleOAuth: mockGoogle } }));
jest.mock('@/cloud/api', () => ({ cloud: { authFlags: 'auth-flags' } }));
jest.mock('@/cloud/appleLifecycle', () => ({ appleReadiness: 'apple-readiness' }));
jest.mock('@/cloud/appleWeb', () => ({ prepareAppleWebSignIn: () => mockPrepare() }));
jest.mock('@/cloud/oauth', () => ({ appleSignInAvailable: async () => mockAvailable, continueWithApple: jest.fn(), continueWithGoogle: jest.fn() }));
jest.mock('@/state/prefs', () => ({ usePrefs: () => ({ set: mockSet, lastSignIn: null }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/ui/Nav', () => ({ Wordmark: () => null }));
jest.mock('@/ui/LegalLinks', () => ({ LegalLinks: () => null }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ name: 'dark', c: { bg: '#000000', ink: '#ffffff', ink2: '#aaaaaa', ink3: '#777777', s1: '#111111', s2: '#222222', line: '#333333', red: '#ff7777' } }) }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
  AppleAuthenticationButton: (props: Record<string, unknown>) => jest.requireActual('react').createElement(jest.requireActual('react-native').View, { ...props, testID: 'native-apple-control' }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
let tree: TestRenderer.ReactTestRenderer | undefined;
const webAppleControls = () => tree!.root.findAll(node => String(node.props.accessibilityLabel).startsWith('Continue with Apple'), { deep: false });
const nativeAppleControls = () => tree!.root.findAllByType(View).filter(node => node.props.testID === 'native-apple-control');
const googleControls = () => tree!.root.findAll(node => String(node.props.accessibilityLabel).startsWith('Continue with Google'), { deep: false });

async function render(os: 'web' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  await act(async () => { tree = TestRenderer.create(<SignIn />); });
}

beforeEach(() => { mockConfigured = false; mockAvailable = true; mockGoogle = false; mockPrepare.mockClear(); mockSet.mockClear(); });
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; Object.defineProperty(Platform, 'OS', platformDescriptor); });

test.each([false, true])('missing web exchange configuration hides Apple while preserving email and configured Google: %s', async google => {
  mockGoogle = google;
  await render('web');
  expect(webAppleControls()).toHaveLength(0);
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(googleControls()).toHaveLength(google ? 1 : 0);
  expect(tree!.root.findAllByProps({ accessibilityLabel: 'Email' }, { deep: false })).not.toHaveLength(0);
});

test('missing native exchange configuration hides the system Apple control', async () => {
  await render('ios');
  expect(nativeAppleControls()).toHaveLength(0);
  expect(mockPrepare).not.toHaveBeenCalled();
});

test('pending readiness does not offer an Apple action or prewarm its web SDK', async () => {
  mockConfigured = undefined;
  await render('web');
  expect(webAppleControls()).toHaveLength(0);
  expect(mockPrepare).not.toHaveBeenCalled();
});

test('configured web sign-in remains available and prewarms only the supported Apple SDK', async () => {
  mockConfigured = true;
  await render('web');
  expect(webAppleControls()).toHaveLength(1);
  expect(mockPrepare).toHaveBeenCalledTimes(1);
});

test('configured native sign-in keeps the system Apple control without a web SDK request', async () => {
  mockConfigured = true;
  await render('ios');
  expect(nativeAppleControls()).toHaveLength(1);
  expect(mockPrepare).not.toHaveBeenCalled();
});

test('unsupported Apple host never offers a control even when server configuration is ready', async () => {
  mockConfigured = true;
  mockAvailable = false;
  await render('web');
  expect(webAppleControls()).toHaveLength(0);
  expect(mockPrepare).not.toHaveBeenCalled();
});
