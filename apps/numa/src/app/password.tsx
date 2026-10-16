import { useAction, useQuery } from 'convex/react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { cloud } from '@/cloud/api';
import { passwordErrorText } from '@/cloud/authErrors';
import { useSession } from '@/cloud/session';
import { PasswordField } from '@/settings/PasswordField';
import { Button } from '@/settings/rows';
import { useTheme } from '@/theme/theme';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

export default function ChangePasswordRoute() {
  const { set } = useLocalSearchParams<{ set?: string }>();
  if (useSession().kind !== 'signedIn') return <Redirect href="/settings" />;
  return set === '1' ? <SetPassword /> : <ChangePassword />;
}

/** For accounts made with Apple or Google: add a password so the same account opens with email anywhere. */
function SetPassword() {
  const { c } = useTheme();
  const toast = useToast();
  const setPassword = useAction(cloud.setPassword);
  const methods = useQuery(cloud.signInMethods, {});
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = again.length > 0 && again !== next;

  async function submit() {
    if (!next || next !== again || busy) return;
    setBusy(true); setError(null);
    try {
      const { email } = await setPassword({ password: next });
      toast({ text: `Password set. Sign in with ${email} on any device.` });
      if (router.canGoBack()) router.back(); else router.replace('/settings');
    } catch (e) { setError(passwordErrorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen back="Settings">
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 8 }}>Set a password</Txt>
      <Txt v="body" c="ink2" style={{ marginTop: 8, maxWidth: 420 }}>
        {methods?.email ? `You’ll sign in with ${methods.email} and this password, on the web or another phone. Apple and Google keep working too.` : 'Apple and Google keep working too.'}
      </Txt>
      <View style={{ marginTop: 20, gap: 14, maxWidth: 420 }}>
        <PasswordField label="New password" value={next} onChangeText={setNext} autoComplete="new-password" />
        <PasswordField label="Type it again" value={again} onChangeText={setAgain} autoComplete="new-password" onSubmitEditing={submit} />
        <Txt v="small" c="ink2">At least 10 characters, using 3 of: uppercase, lowercase, number, symbol.</Txt>
        {mismatch ? <Txt v="small" style={{ color: c.down }}>The two don’t match yet.</Txt> : null}
        {error ? <Txt v="small" style={{ color: c.down }} accessibilityLiveRegion="polite">{error}</Txt> : null}
        <View style={{ flexDirection: 'row' }}>
          <Button label={busy ? 'Setting…' : 'Set password'} onPress={submit} disabled={busy || !next || next !== again} />
        </View>
      </View>
    </Screen>
  );
}

function ChangePassword() {
  const { c } = useTheme();
  const toast = useToast();
  const change = useAction(cloud.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!current || !next || busy) return;
    setBusy(true); setError(null);
    try {
      await change({ currentPassword: current, newPassword: next });
      toast({ text: 'Password changed. Your other devices are signed out.' });
      if (router.canGoBack()) router.back(); else router.replace('/settings');
    } catch (e) { setError(passwordErrorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen back="Settings">
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 8 }}>Change password</Txt>
      <View style={{ marginTop: 20, gap: 14, maxWidth: 420 }}>
        <PasswordField label="Current password" value={current} onChangeText={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={next} onChangeText={setNext} autoComplete="new-password" onSubmitEditing={submit} />
        <Txt v="small" c="ink2">At least 10 characters, using 3 of: uppercase, lowercase, number, symbol. Other devices are signed out when it changes.</Txt>
        {error ? <Txt v="small" style={{ color: c.down }} accessibilityLiveRegion="polite">{error}</Txt> : null}
        <View style={{ flexDirection: 'row' }}>
          <Button label={busy ? 'Changing…' : 'Change password'} onPress={submit} disabled={busy || !current || !next} />
        </View>
      </View>
    </Screen>
  );
}
