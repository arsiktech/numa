import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { cloud } from '@/cloud/api';
import { authErrorText, resetErrorText } from '@/cloud/authErrors';
import { appleSignInAvailable, continueWithApple, continueWithGoogle } from '@/cloud/oauth';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { type as typeScale } from '@/theme/tokens';
import { Wordmark } from '@/ui/Nav';
import { Txt } from '@/ui/Txt';

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
        style={{ minHeight: 52, borderRadius: 14, paddingHorizontal: 16, backgroundColor: c.s1, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 16, borderWidth: 2, borderColor: focused ? c.ink : 'transparent', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
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

/** One tap: Apple's own button on iPhone, then Google everywhere it is set up. */
function QuickSignIn({ busy, onApple, onGoogle }: { busy: boolean; onApple: () => void; onGoogle: () => void }) {
  const { c, name } = useTheme();
  const flags = useQuery(cloud.authFlags, {});
  const [apple, setApple] = useState(false);
  useEffect(() => { let live = true; appleSignInAvailable().then((ok) => { if (live) setApple(ok); }); return () => { live = false; }; }, []);
  const google = flags?.googleOAuth === true;
  if (!apple && !google) return null;
  return (
    <View style={{ gap: 10, opacity: busy ? 0.5 : 1 }} pointerEvents={busy ? 'none' : 'auto'}>
      {apple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={name === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={26}
          style={{ height: 52 }}
          onPress={onApple}
        />
      )}
      {google && (
        <Pressable onPress={onGoogle} accessibilityRole="button" accessibilityLabel="Continue with Google" style={{ minHeight: 52, borderRadius: 999, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.s1, borderWidth: 1, borderColor: c.s2 }}>
          <GoogleMark />
          <Txt v="body" c="ink" style={{ fontFamily: 'Manrope_700Bold', fontSize: 16 }}>Continue with Google</Txt>
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
  const { set } = usePrefs();
  const [flow, setFlow] = useState<Flow>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<Step>('form');
  const verifying = step === 'verify';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = /.+@.+\..+/.test(cleanEmail);
  const canSubmit = step === 'verify' ? code.trim().length >= 6
    : step === 'resetEmail' ? validEmail
    : step === 'resetCode' ? code.trim().length >= 6 && newPassword.length >= 10
    : validEmail && password.length >= (flow === 'signUp' ? 10 : 1);

  const go = (next: Step) => { setStep(next); setCode(''); setError(null); };

  async function quick(provider: 'apple' | 'google') {
    if (busy) return;
    setBusy(true);
    setError(null);
    let outcome: Awaited<ReturnType<typeof continueWithGoogle>> | null = null;
    try {
      outcome = provider === 'apple' ? await continueWithApple(signIn) : await continueWithGoogle(signIn);
    } catch {
      setError(`Couldn’t sign in with ${provider === 'apple' ? 'Apple' : 'Google'}. Try again, or use email.`);
    } finally {
      // On web the page is leaving for Google, so keep the buttons quiet until it does.
      if (outcome !== 'leaving') setBusy(false);
    }
  }

  async function submit() {
    if (!canSubmit || busy) return;
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
      } else if (verifying) {
        const result = await signIn('password', { email: cleanEmail, code: code.trim(), flow: 'email-verification' });
        if (!result.signingIn) setError(authErrorText(null, 'email-verification'));
      } else {
        const result = await signIn('password', { email: cleanEmail, password, flow, ...(flow === 'signUp' ? { name: cleanEmail.split('@')[0] } : {}) });
        // Accounts that still need email verification get a code instead of a session.
        if (!result.signingIn) setStep('verify');
      }
    } catch (e) {
      setError(step === 'resetEmail' || step === 'resetCode' ? resetErrorText(e, step) : authErrorText(e, verifying ? 'email-verification' : flow));
    } finally {
      setBusy(false);
    }
  }

  const tab = (f: Flow, label: string) => (
    <Pressable onPress={() => { setFlow(f); setError(null); }} accessibilityRole="tab" aria-selected={flow === f} style={{ flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: flow === f ? c.s2 : 'transparent' }}>
      <Txt v="body" c={flow === f ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{label}</Txt>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <View style={{ marginLeft: -12 }}><Wordmark /></View>
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 40 }}>
            <Txt style={{ ...typeScale.hero, lineHeight: 62, color: c.ink }} accessibilityRole="header">{headline[step]}</Txt>
            <Txt v="body" c="ink2" style={{ marginTop: 14 }}>
              {step === 'verify' ? `We sent a code to ${cleanEmail}. Enter it to finish.`
                : step === 'resetEmail' ? 'Enter your email and we’ll send a code to set a new password.'
                : step === 'resetCode' ? `If ${cleanEmail} has an account, a code is on its way. Enter it with a new password.`
                : 'Net worth, cash flow and what needs you, on every device.'}
            </Txt>

            <View style={{ marginTop: 32, gap: 14 }}>
              {step === 'verify' ? (
                <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={submit} />
              ) : step === 'resetEmail' ? (
                <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" inputMode="email" autoFocus onSubmitEditing={submit} />
              ) : step === 'resetCode' ? (
                <>
                  <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
                  <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
                  <Txt v="small" c="ink3">At least 10 characters, with 3 of: uppercase, lowercase, number, symbol.</Txt>
                </>
              ) : (
                <>
                  <QuickSignIn busy={busy} onApple={() => quick('apple')} onGoogle={() => quick('google')} />
                  <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.s1 }} accessibilityRole="tablist">
                    {tab('signIn', 'Sign in')}
                    {tab('signUp', 'Create account')}
                  </View>
                  <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" inputMode="email" />
                  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'} textContentType={flow === 'signUp' ? 'newPassword' : 'password'} onSubmitEditing={submit} />
                  {flow === 'signUp' && <Txt v="small" c="ink3">At least 10 characters, with 3 of: uppercase, lowercase, number, symbol.</Txt>}
                  {flow === 'signIn' && (
                    <Pressable onPress={() => go('resetEmail')} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
                      <Txt v="small" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>Forgot password?</Txt>
                    </Pressable>
                  )}
                </>
              )}

              {error && <Txt v="body" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt>}

              <Pressable onPress={submit} disabled={!canSubmit || busy} accessibilityRole="button" aria-disabled={!canSubmit || busy} aria-busy={busy} style={{ marginTop: 6, minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: canSubmit ? 1 : 0.4 }}>
                {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold', fontSize: 16 }}>{step === 'verify' ? 'Confirm' : step === 'resetEmail' ? 'Send code' : step === 'resetCode' ? 'Set password and sign in' : flow === 'signIn' ? 'Sign in' : 'Create account'}</Txt>}
              </Pressable>

              {step !== 'form' && (
                <Pressable onPress={() => go('form')} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>{step === 'verify' ? 'Use another email' : 'Back to sign in'}</Txt>
                </Pressable>
              )}
            </View>
          </View>

          {step === 'form' && (
            <Pressable onPress={() => set('demo', true)} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Txt v="body" c="ink2">Just looking? <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Explore with demo data</Txt></Txt>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
