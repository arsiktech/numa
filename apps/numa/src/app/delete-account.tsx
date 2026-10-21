import { useAuthActions } from '@convex-dev/auth/react';
import { useConvex, useMutation } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { AppleDeletionHelp } from '@/settings/AppleDeletionHelp';
import { PasswordField } from '@/settings/PasswordField';
import { Action, Button } from '@/settings/rows';
import { useExport } from '@/settings/useExport';
import { useTheme } from '@/theme/theme';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

const WORD = 'delete';

export default function DeleteAccountRoute() {
  return useSession().kind === 'signedIn' ? <DeleteAccount /> : <Redirect href="/settings" />;
}

function DeleteAccount() {
  const { c } = useTheme();
  const convex = useConvex();
  const remove = useMutation(cloud.deleteMyAccount);
  const { signOut } = useAuthActions();
  const data = useCloudData();
  const exp = useExport();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = data.status === 'ready' ? data.spaces.filter((s) => s.role === 'owner').map((s) => s.name) : [];
  const armed = typed.trim().toLowerCase() === WORD;

  async function submit() {
    if (!armed || busy) return;
    setBusy(true); setError(null);
    try {
      await remove({});
      // Usually a 7-day grace period starts. If the account was erased at once, there is nothing left to show.
      const me = await convex.query(cloud.me, {}).catch(() => null);
      if (me?.deletionScheduledAt) router.replace('/settings');
      else await signOut().catch(() => undefined);
    } catch {
      setError('Couldn’t confirm the deletion request. Check Settings before trying again.');
      setBusy(false);
    }
  }

  return (
    <Screen back="Settings">
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 8 }}>Delete account</Txt>
      <View style={{ marginTop: 16, gap: 12, maxWidth: 520 }}>
        <Txt v="body">This deletes your Numa account and everything in the spaces you own{owned.length ? `: ${owned.join(', ')}` : ''}. Spaces someone else shared with you keep their records.</Txt>
        <Txt v="body" c="ink2">You have 7 days to change your mind. Sign in during that time and choose Keep my account.</Txt>
        <AppleDeletionHelp />
        <Action label={exp.state.kind === 'running' ? 'Copying…' : 'Download a copy first'} disabled={!exp.ready || exp.state.kind === 'running'} onPress={async () => { await exp.run(); }} />
        {exp.state.kind === 'done' ? <Txt v="small" c="ink2">Saved {exp.state.file}</Txt> : null}
        {exp.state.kind === 'failed' ? <Txt v="small" style={{ color: c.down }}>{exp.state.message}</Txt> : null}
        <View style={{ marginTop: 8 }}>
          <PasswordField label={`Type ${WORD} to confirm`} value={typed} onChangeText={setTyped} autoComplete="off" onSubmitEditing={submit} />
        </View>
        {error ? <Txt v="small" style={{ color: c.down }} accessibilityLiveRegion="polite">{error}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label={busy ? 'Deleting…' : 'Delete my account'} danger onPress={submit} disabled={!armed || busy} />
          <Button label="Cancel" quiet onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        </View>
      </View>
    </Screen>
  );
}
