import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useCloudData } from '@/data/cloud';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';
import { Action, Button, Row, Section } from './rows';
import { useExport } from './useExport';

const longDay = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const sectionWords: Record<string, string> = { transactions: 'transactions', holdings: 'holdings', assets: 'what you own', liabilities: 'what you owe', goals: 'goals' };

/** Shown at the top of Settings while an account deletion is waiting out its grace period. */
export function DeletionBanner() {
  const me = useQuery(cloud.me, {});
  const cancel = useMutation(cloud.cancelMyDeletion);
  const { c } = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me?.deletionScheduledAt) return null;
  const started = me.deletionStartedAt !== null;
  return (
    <View style={{ marginTop: 20, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.down, gap: 10 }} accessibilityRole="alert">
      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{started ? 'Your account is being deleted' : `Your account will be deleted on ${longDay(me.deletionScheduledAt)}`}</Txt>
      <Txt v="small" c="ink2">{started ? 'Deletion has started and can no longer be stopped. Contact support if this is a mistake.' : 'Everything in the spaces you own goes with it. You can still change your mind.'}</Txt>
      {message ? <Txt v="small" style={{ color: c.down }} accessibilityLiveRegion="polite">{message}</Txt> : null}
      {!started && (
        <View style={{ flexDirection: 'row' }}>
          <Button label={busy ? 'Keeping…' : 'Keep my account'} disabled={busy} onPress={async () => {
            setBusy(true); setMessage(null);
            try {
              const r = await cancel({});
              if (!r.ok) setMessage('Deletion has already started and can’t be stopped. Contact support.');
            } catch { setMessage('Couldn’t reach Numa. Try again.'); }
            finally { setBusy(false); }
          }} />
        </View>
      )}
    </View>
  );
}

export function DataSection() {
  const { state, run, ready } = useExport();
  const { c } = useTheme();
  const data = useCloudData();
  const name = data.status === 'ready' ? data.space.name : 'this space';
  const label = state.kind === 'running' ? `Copying ${sectionWords[state.section] ?? 'records'}…` : `Download a copy of ${name}`;
  return (
    <>
      <Section title="DATA" />
      <Action label="Import from a sheet or CSV" onPress={() => router.push('/import')} />
      <Action label={label} disabled={!ready || state.kind === 'running'} detail="Every record in one JSON file, with original currencies and dates." onPress={async () => { await run(); }} />
      {state.kind === 'done' ? <Txt v="small" c="ink2" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">Saved {state.file}</Txt> : null}
      {state.kind === 'failed' ? <Txt v="small" style={{ marginTop: 8, color: c.down }} accessibilityLiveRegion="polite">{state.message}</Txt> : null}
    </>
  );
}

/** How this account can sign in, the same on every device: Apple, Google, and email with a password. */
function SignInMethods() {
  const { c } = useTheme();
  const methods = useQuery(cloud.signInMethods, {});
  if (!methods) return null;
  const state = (on: boolean) => <Txt v="small" style={{ color: on ? c.upInk : c.ink3, fontFamily: 'Manrope_700Bold' }}>{on ? 'Connected' : 'Not connected'}</Txt>;
  const relay = methods.privateRelay ? ' This is the private address Apple made for you; it forwards to your own inbox.' : '';
  return (
    <>
      <Row title="Apple" detail="Continue with Apple, on iPhone and on the web.">{state(methods.apple)}</Row>
      <Row title="Google" detail="Continue with Google, with the same email as this account.">{state(methods.google)}</Row>
      {methods.password ? (
        <Action label="Change password" detail={methods.email ? `Sign in anywhere with ${methods.email} and your password.` : undefined} onPress={() => router.push('/password')} />
      ) : (
        <Action label="Set a password" detail={methods.email ? `Then sign in anywhere with ${methods.email} and that password.${relay}` : 'Add a password to sign in with email.'} onPress={() => router.push({ pathname: '/password', params: { set: '1' } })} />
      )}
    </>
  );
}

export function AccountSection() {
  const me = useQuery(cloud.me, {});
  const { signOut } = useAuthActions();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Section title="ACCOUNT" />
      <Row title="Signed in" detail={me?.email ? `${me.email}. Your data syncs across your devices.` : 'Your data syncs across your devices.'} />
      <SignInMethods />
      <Action label={busy ? 'Signing out…' : 'Sign out'} onPress={async () => { setBusy(true); try { await signOut(); } finally { setBusy(false); } }} />
      {!me?.deletionScheduledAt && <Action label="Delete account" danger onPress={() => router.push('/delete-account')} />}
    </>
  );
}
