import { webFont } from '@/theme/webFont';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { cloud } from '@/cloud/api';
import { authErrorText, resetErrorText } from '@/cloud/authErrors';
import { appleReadiness } from '@/cloud/appleLifecycle';
import { prepareAppleWebSignIn } from '@/cloud/appleWeb';
import { appleSignInAvailable, continueWithApple, continueWithGoogle } from '@/cloud/oauth';
import { usePrefs, type SignInMethod } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { type as typeScale } from '@/theme/tokens';
import { Wordmark } from '@/ui/Nav';
import { Txt } from '@/ui/Txt';
import { LegalLinks } from '@/ui/LegalLinks';

type Flow = 'signIn' | 'signUp';
/** Where the screen is: the main form, an emailed sign-up code, or the two password-reset steps. */
type Step = 'form' | 'verify' | 'resetEmail' | 'resetCode';

const headline: Record<Step, string> = { form: 'Your money,\nlive.', verify: 'Check your email', resetEmail: 'Reset your password', resetCode: 'Check your email' };

function Field(props: TextInputProps & { label: string }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const { label, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Txt v="small" c="ink2">{label}</Txt>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        placeholderTextColor={c.ink3}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={{ minHeight: 52, borderRadius: 14, paddingHorizontal: 16, backgroundColor: c.s1, color: c.ink, fontFamily: Platform.OS === 'web' ? webFont('Manrope_500Medium') : 'Manrope_500Medium', fontSize: 16, borderWidth: 2, borderColor: focused ? c.ink : 'transparent', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
      />
    </View>
  );
}

/** Google's "G", in its own colours, as its brand rules ask. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** Apple's logo, for the web button (iPhone uses Apple's own button). */
function AppleMark({ color }: { color: string }) {
  return (
    <Svg width={16} height={19} viewBox="0 0 814 1000" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill={color} d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </Svg>
  );
}

/** "Last used": how this device signed in before, so returning people find their way in at a glance. */
function LastUsed({ on }: { on: 'dark' | 'light' }) {
  const { c } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
      <View style={{ paddingHorizontal: 8, minHeight: 20, borderRadius: 999, justifyContent: 'center', backgroundColor: on === 'dark' ? 'rgba(255,255,255,0.18)' : c.s2 }}>
        <Txt v="label" style={{ fontSize: 10, color: on === 'dark' ? '#FFFFFF' : c.ink2 }} maxFontSizeMultiplier={1.3}>Last used</Txt>
      </View>
    </View>
  );
}

/** One tap: Apple (its own button on iPhone, Apple's popup on the web), then Google everywhere it is set up. */
function QuickSignIn({ busy, last, onApple, onGoogle }: { busy: boolean; last: SignInMethod | null; onApple: () => void; onGoogle: () => void }) {
  const { c, name } = useTheme();
  const flags = useQuery(cloud.authFlags, {});
  const appleLifecycle = useQuery(appleReadiness, {});
  const [apple, setApple] = useState(false);
  useEffect(() => {
    let live = true;
    appleSignInAvailable().then((ok) => {
      if (live) setApple(ok);
    });
    return () => { live = false; };
  }, []);
  const appleReady = apple && appleLifecycle?.configured === true;
  useEffect(() => {
    if (appleReady && Platform.OS === 'web') void prepareAppleWebSignIn().catch(() => {});
  }, [appleReady]);
  const google = flags?.googleOAuth === true;
  if (!apple && !google) return null;
  return (
    <View style={{ gap: 10, opacity: busy ? 0.5 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
      {appleReady && Platform.OS !== 'web' && (
        <View>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={name === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={26}
            style={{ height: 52 }}
            onPress={onApple}
          />
          {last === 'apple' && <LastUsed on={name === 'dark' ? 'light' : 'dark'} />}
        </View>
      )}
      {appleReady && Platform.OS === 'web' && (
        <Pressable onPress={onApple} accessibilityRole="button" accessibilityLabel={`Continue with Apple${last === 'apple' ? ', last used' : ''}`} style={{ minHeight: 52, borderRadius: 999, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink }}>
          <AppleMark color={c.bg} />
          <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold', fontSize: 16 }}>Continue with Apple</Txt>
          {last === 'apple' && <LastUsed on={name === 'dark' ? 'light' : 'dark'} />}
        </Pressable>
      )}
      {apple && appleLifecycle === undefined && <Txt v="small" c="ink2">Checking Apple sign-in…</Txt>}
      {apple && appleLifecycle?.configured === false && <Txt v="small" c="ink2">Apple sign-in is unavailable right now. Use email{google ? ' or Google' : ''}.</Txt>}
      {google && (
        <Pressable onPress={onGoogle} accessibilityRole="button" accessibilityLabel={`Continue with Google${last === 'google' ? ', last used' : ''}`} style={{ minHeight: 52, borderRadius: 999, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.s1, borderWidth: 1, borderColor: c.s2 }}>
          <GoogleMark />
          <Txt v="body" c="ink" style={{ fontFamily: 'Manrope_700Bold', fontSize: 16 }}>Continue with Google</Txt>
          {last === 'google' && <LastUsed on={name === 'dark' ? 'dark' : 'light'} />}
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ flex: 1, height: 1, backgroundColor: c.s2 }} />
        <Txt v="small" c="ink3">or use email</Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: c.s2 }} />
      </View>
    </View>
  );
}

/** Sign in or create an account with email and password. Unverified accounts get a code by email; a forgotten password is reset with an emailed code. */
export default function SignIn() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuthActions();
  const { set, lastSignIn } = usePrefs();
  const [flow, setFlow] = useState<Flow>('signIn');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<Step>('form');
  const verifying = step === 'verify';
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const attemptRef = useRef(0);
  const appleAbort = useRef<AbortController | null>(null);
  const appleExchange = useRef(false);
  const [finishingApple, setFinishingApple] = useState(false);
  const [quickProvider, setQuickProvider] = useState<'apple' | 'google' | null>(null);
  useEffect(() => () => { attemptRef.current += 1; appleAbort.current?.abort(); }, []);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(cleanEmail);
  const canSubmit = step === 'verify' ? code.trim().length >= 6
    : step === 'resetEmail' ? validEmail
    : step === 'resetCode' ? code.trim().length >= 6 && newPassword.length >= 10
    : validEmail && password.length >= (flow === 'signUp' ? 10 : 1);

  const go = (next: Step) => { setStep(next); setCode(''); setError(null); };

  async function quick(provider: 'apple' | 'google') {
    if (busyRef.current) return;
    busyRef.current = true;
    const attempt = ++attemptRef.current;
    const abort = new AbortController();
    appleAbort.current = provider === 'apple' ? abort : null;
    appleExchange.current = false; setFinishingApple(false);
    setQuickProvider(provider);
    setBusy(true);
    setError(null);
    let outcome: Awaited<ReturnType<typeof continueWithGoogle>> | null = null;
    // On web Google takes the page away, so it is remembered before leaving.
    if (provider === 'google' && Platform.OS === 'web') set('lastSignIn', 'google');
    try {
      outcome = provider === 'apple' ? await continueWithApple(signIn, abort.signal, () => { appleExchange.current = true; setFinishingApple(true); }) : await continueWithGoogle(signIn);
      if (attempt !== attemptRef.current) return;
      if (outcome === 'signedIn') set('lastSignIn', provider);
    } catch {
      if (attempt === attemptRef.current) setError(`Couldn’t sign in with ${provider === 'apple' ? 'Apple' : 'Google'}. Try again, or use email.`);
    } finally {
      // On web the page is leaving for Google, so keep the buttons quiet until it does.
      if (attempt === attemptRef.current && outcome !== 'leaving') {
        busyRef.current = false; appleAbort.current = null; appleExchange.current = false; setFinishingApple(false); setQuickProvider(null); setBusy(false);
      }
    }
  }

  function useEmailInstead() {
    // Once the exchange starts, its provider owns a session write that cannot be aborted.
    if (appleExchange.current) return;
    attemptRef.current += 1; appleAbort.current?.abort(); appleAbort.current = null;
    busyRef.current = false; setBusy(false); setQuickProvider(null); setError(null);
  }

  async function submit() {
    if (!canSubmit || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (step === 'resetEmail') {
        // The reply is the same whether or not the account exists, so nobody can probe for emails.
        await signIn('password', { email: cleanEmail, flow: 'reset' });
        go('resetCode');
      } else if (step === 'resetCode') {
        const result = await signIn('password', { email: cleanEmail, code: code.trim(), newPassword, flow: 'reset-verification' });
        if (!result.signingIn) setError('That code didn’t work. Check the latest email and try again.');
        else set('lastSignIn', 'password');
      } else if (verifying) {
        const result = await signIn('password', { email: cleanEmail, code: code.trim(), flow: 'email-verification' });
        if (!result.signingIn) setError(authErrorText(null, 'email-verification'));
        else set('lastSignIn', 'password');
      } else {
        const result = await signIn('password', { email: cleanEmail, password, flow, ...(flow === 'signUp' ? { name: cleanEmail.split('@')[0] } : {}) });
        // Accounts that still need email verification get a code instead of a session.
        if (!result.signingIn) setStep('verify');
        else set('lastSignIn', 'password');
      }
    } catch (e) {
      setError(step === 'resetEmail' || step === 'resetCode' ? resetErrorText(e, step) : authErrorText(e, verifying ? 'email-verification' : flow));
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  const tab = (f: Flow, label: string) => (
    <Pressable disabled={busy} onPress={() => { setFlow(f); setError(null); }} accessibilityRole="tab" aria-selected={flow === f} accessibilityLabel={f === 'signIn' && lastSignIn === 'password' ? `${label}, last used` : label} style={{ flex: 1, minHeight: 40, borderRadius: 999, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: flow === f ? c.s2 : 'transparent' }}>
      <Txt v="body" c={flow === f ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{label}</Txt>
      {f === 'signIn' && lastSignIn === 'password' && <Txt v="label" c="ink3" style={{ fontSize: 10 }} maxFontSizeMultiplier={1.3}>· Last used</Txt>}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <View style={{ marginLeft: -12 }}><Wordmark /></View>
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}>
            <Txt style={{ ...typeScale.hero, lineHeight: 62, color: c.ink }} accessibilityRole="header">{headline[step]}</Txt>
            <Txt v="body" c="ink2" style={{ marginTop: 14 }}>
              {step === 'verify' ? `We sent a code to ${cleanEmail}. Enter it to finish.`
                : step === 'resetEmail' ? 'Enter your email and we’ll send a code to set a new password.'
                : step === 'resetCode' ? `If ${cleanEmail} has an account, a code is on its way. Enter it with a new password.`
                : 'Net worth, cash flow and what needs you, on every device.'}
            </Txt>

            {step === 'form' && <>
              <Txt v="small" c="ink2" style={{ marginTop: 12 }}>Free during beta. No card required. We’ll give notice before any paid plan.</Txt>
              <Pressable disabled={busy} onPress={() => set('demo', true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', marginTop: 6 }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Explore with demo data</Txt>
              </Pressable>
              <LegalLinks />
            </>}
            <View style={{ marginTop: 20, gap: 14 }}>
              {step === 'verify' ? (
                <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={submit} />
              ) : step === 'resetEmail' ? (
                <Field label="Email" value={email} onChangeText={setEmail} onBlur={() => setEmailTouched(true)} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" inputMode="email" autoFocus onSubmitEditing={submit} />
              ) : step === 'resetCode' ? (
                <>
                  <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
                  <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
                  <Txt v="small" c="ink3">At least 10 characters, with 3 of: uppercase, lowercase, number, symbol.</Txt>
                </>
              ) : (
                <>
                  <QuickSignIn busy={busy} last={lastSignIn} onApple={() => quick('apple')} onGoogle={() => quick('google')} />
                  {quickProvider && <View style={{ gap: 4 }}>
                    <Txt v="small" c="ink2" accessibilityLiveRegion="polite">{quickProvider === 'apple' ? (finishingApple ? 'Finishing Apple sign-in… Please wait.' : 'Finish signing in in the Apple window. If no window opens, use email instead.') : 'Opening Google sign-in…'}</Txt>
                    {quickProvider === 'apple' && Platform.OS === 'web' && !finishingApple && <Pressable onPress={useEmailInstead} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Use email instead</Txt></Pressable>}
                  </View>}
                  <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.s1 }} accessibilityRole="tablist">
                    {tab('signIn', 'Sign in')}
                    {tab('signUp', 'Create account')}
                  </View>
                  <Field label="Email" value={email} onChangeText={setEmail} onBlur={() => setEmailTouched(true)} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" inputMode="email" />
                  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'} textContentType={flow === 'signUp' ? 'newPassword' : 'password'} onSubmitEditing={submit} />
                  {flow === 'signUp' && <Txt v="small" c="ink3">At least 10 characters, with 3 of: uppercase, lowercase, number, symbol.</Txt>}
                  {flow === 'signIn' && (
                    <Pressable disabled={busy} onPress={() => go('resetEmail')} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
                      <Txt v="small" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>Forgot password?</Txt>
                    </Pressable>
                  )}
                </>
              )}

              {emailTouched && !validEmail && (step === 'form' || step === 'resetEmail') && <Txt v="small" style={{ color: c.down }} accessibilityRole="alert">Enter a valid email address, like name@example.com.</Txt>}
              {error && <Txt v="body" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt>}

              <Pressable onPress={submit} disabled={!canSubmit || busy} accessibilityRole="button" aria-disabled={!canSubmit || busy} aria-busy={busy} style={{ marginTop: 6, minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: canSubmit ? 1 : 0.4 }}>
                {busy && !quickProvider ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold', fontSize: 16 }}>{step === 'verify' ? 'Confirm' : step === 'resetEmail' ? 'Send code' : step === 'resetCode' ? 'Set password and sign in' : flow === 'signIn' ? 'Sign in' : 'Create account'}</Txt>}
              </Pressable>

              {step !== 'form' && (
                <Pressable onPress={() => go('form')} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>{step === 'verify' ? 'Use another email' : 'Back to sign in'}</Txt>
                </Pressable>
              )}
            </View>
          </View>


        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
