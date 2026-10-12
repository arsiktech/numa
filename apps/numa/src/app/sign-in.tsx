import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authErrorText } from '@/cloud/authErrors';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { type as typeScale } from '@/theme/tokens';
import { Wordmark } from '@/ui/Nav';
import { Txt } from '@/ui/Txt';

type Flow = 'signIn' | 'signUp';

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
        style={{ height: 52, borderRadius: 14, paddingHorizontal: 16, backgroundColor: c.s1, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 16, borderWidth: 2, borderColor: focused ? c.ink : 'transparent', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
      />
    </View>
  );
}

/** Sign in or create an account with email and password. Unverified accounts get a code by email. */
export default function SignIn() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuthActions();
  const { set } = usePrefs();
  const [flow, setFlow] = useState<Flow>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const canSubmit = verifying ? code.trim().length >= 6 : /.+@.+\..+/.test(cleanEmail) && password.length >= (flow === 'signUp' ? 10 : 1);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (verifying) {
        const result = await signIn('password', { email: cleanEmail, code: code.trim(), flow: 'email-verification' });
        if (!result.signingIn) setError(authErrorText(null, 'email-verification'));
      } else {
        const result = await signIn('password', { email: cleanEmail, password, flow, ...(flow === 'signUp' ? { name: cleanEmail.split('@')[0] } : {}) });
        // Accounts that still need email verification get a code instead of a session.
        if (!result.signingIn) setVerifying(true);
      }
    } catch (e) {
      setError(authErrorText(e, verifying ? 'email-verification' : flow));
    } finally {
      setBusy(false);
    }
  }

  const tab = (f: Flow, label: string) => (
    <Pressable onPress={() => { setFlow(f); setError(null); }} accessibilityRole="tab" aria-selected={flow === f} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: flow === f ? c.s2 : 'transparent' }}>
      <Txt v="body" c={flow === f ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{label}</Txt>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <View style={{ marginLeft: -12 }}><Wordmark /></View>
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 40 }}>
            <Txt style={{ ...typeScale.hero, color: c.ink }} accessibilityRole="header">{verifying ? 'Check your email' : 'Your money,\nlive.'}</Txt>
            <Txt v="body" c="ink2" style={{ marginTop: 14 }}>
              {verifying ? `We sent a code to ${cleanEmail}. Enter it to finish.` : 'Net worth, cash flow and what needs you, on every device.'}
            </Txt>

            <View style={{ marginTop: 32, gap: 14 }}>
              {verifying ? (
                <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus onSubmitEditing={submit} />
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: c.s1 }} accessibilityRole="tablist">
                    {tab('signIn', 'Sign in')}
                    {tab('signUp', 'Create account')}
                  </View>
                  <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" inputMode="email" />
                  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={flow === 'signUp' ? 'new-password' : 'current-password'} textContentType={flow === 'signUp' ? 'newPassword' : 'password'} onSubmitEditing={submit} />
                  {flow === 'signUp' && <Txt v="small" c="ink3">At least 10 characters, with 3 of: uppercase, lowercase, number, symbol.</Txt>}
                </>
              )}

              {error && <Txt v="body" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt>}

              <Pressable onPress={submit} disabled={!canSubmit || busy} accessibilityRole="button" aria-disabled={!canSubmit || busy} aria-busy={busy} style={{ marginTop: 6, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: canSubmit ? 1 : 0.4 }}>
                {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold', fontSize: 16 }}>{verifying ? 'Confirm' : flow === 'signIn' ? 'Sign in' : 'Create account'}</Txt>}
              </Pressable>

              {verifying && (
                <Pressable onPress={() => { setVerifying(false); setCode(''); setError(null); }} accessibilityRole="button" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>Use another email</Txt>
                </Pressable>
              )}
            </View>
          </View>

          {!verifying && (
            <Pressable onPress={() => set('demo', true)} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Txt v="body" c="ink2">Just looking? <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Explore with demo data</Txt></Txt>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
