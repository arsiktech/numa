import { useAction } from 'convex/react';
import { Redirect, router } from 'expo-router';
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
  return useSession().kind === 'signedIn' ? <ChangePassword /> : <Redirect href="/settings" />;
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
