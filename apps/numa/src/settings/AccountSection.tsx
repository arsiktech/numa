import { usePhoneSignOut } from '@/alerts/signOut';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { googleLinkText, linkGoogle, type GoogleLinkResult, needsFreshSignIn, parseGoogleLinkResult, signInMethodErrorText } from '@/cloud/googleLink';
import { appleSignInAvailable, continueWithApple, continueWithGoogle } from '@/cloud/oauth';
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

type Note = { text: string; tone: 'ok' | 'error' };

function noteFor(result: GoogleLinkResult | null): Note | null {
  const text = result ? googleLinkText(result) : null;
  return text ? { text, tone: result === 'linked' || result === 'already' ? 'ok' : 'error' } : null;
}

/**
 * How this account can sign in, the same on every device. Each linked method shows with its own
 * address. Google accounts can be added (even with a different email) and removed, as long as
 * another way in remains.
 */
function SignInMethods() {
  const { c } = useTheme();
  const methods = useQuery(cloud.signInMethods, {});
  const flags = useQuery(cloud.authFlags, {});
  const startLink = useMutation(cloud.startGoogleLink);
  const unlink = useMutation(cloud.unlinkSignIn);
  const { signIn } = useAuthActions();
  const signOut = usePhoneSignOut();
  const params = useLocalSearchParams<{ googleLink?: string }>();
  const [busy, setBusy] = useState<'add' | 'confirm' | string | null>(null);
  // The web comes back from Google to /settings?googleLink=…, so the first render already knows the outcome.
  const [note, setNote] = useState<Note | null>(() => noteFor(parseGoogleLinkResult(params.googleLink)));
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [appleHere, setAppleHere] = useState(false);

  useEffect(() => {
    let live = true;
    appleSignInAvailable().then((ok) => { if (live) setAppleHere(ok); });
    return () => { live = false; };
  }, []);

  // Then tidy the address so a reload doesn't repeat the message.
  // Only the web returns this way. Edit the address directly, after the router has synced it:
  // router.setParams re-writes the URL later and would put the parameter back.
  useEffect(() => {
    if (Platform.OS !== 'web' || !params.googleLink) return;
    const tidy = setTimeout(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('googleLink')) return;
      url.searchParams.delete('googleLink');
      window.history.replaceState(window.history.state, '', url.toString());
    }, 300);
    return () => clearTimeout(tidy);
  }, [params.googleLink]);

  if (!methods) return null;
  const list = methods.methods;
  const googles = list?.filter((m) => m.kind === 'google') ?? [];
  const apple = list?.find((m) => m.kind === 'apple');
  const canAdd = methods.canAddGoogle === true && flags?.googleOAuth !== false;
  const relay = methods.privateRelay ? ' This is the private address Apple made for you; it forwards to your own inbox.' : '';
  const state = (on: boolean) => <Txt v="small" style={{ color: on ? c.upInk : c.ink3, fontFamily: 'Manrope_700Bold' }}>{on ? 'Connected' : 'Not connected'}</Txt>;

  async function add() {
    setBusy('add'); setNote(null); setConfirming(false);
    try {
      const result = await linkGoogle(startLink);
      if (result === 'leaving') return;
      setNote(noteFor(result));
    } catch (e) {
      if (needsFreshSignIn(e)) setConfirming(true);
      else setNote({ text: signInMethodErrorText(e), tone: 'error' });
    } finally { setBusy(null); }
  }

  /** A fresh sign-in with a method the account already has, then straight on to Google. */
  async function confirmWith(kind: 'apple' | 'google') {
    setBusy('confirm'); setNote(null);
    try {
      const outcome = kind === 'apple' ? await continueWithApple(signIn) : await continueWithGoogle(signIn);
      if (outcome === 'leaving') return;
      if (outcome !== 'signedIn') { setBusy(null); return; }
      await add();
    } catch {
      setNote({ text: 'Couldn’t confirm it’s you. Try again.', tone: 'error' });
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id); setNote(null);
    try {
      await unlink({ accountId: id });
      setRemoving(null);
      setNote({ text: 'Google removed. It no longer opens this account.', tone: 'ok' });
    } catch (e) { setNote({ text: signInMethodErrorText(e), tone: 'error' }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <Row title="Apple" detail={apple?.label ? `${apple.label}. Continue with Apple, on iPhone and on the web.` : 'Continue with Apple, on iPhone and on the web.'}>{state(methods.apple)}</Row>
      {list === undefined ? (
        <Row title="Google" detail="Continue with Google, with the same email as this account.">{state(methods.google)}</Row>
      ) : googles.length === 0 ? (
        <Row title="Google" detail="Not linked yet.">{state(false)}</Row>
      ) : googles.map((g) => removing === g.id ? (
        <View key={g.id} style={{ paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>Remove {g.label ?? 'this Google account'}?</Txt>
          <Txt v="small" c="ink2">It will stop opening this account. Your data stays here.</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={busy === g.id ? 'Removing…' : 'Remove'} danger disabled={busy !== null} onPress={() => remove(g.id)} />
            <Button label="Keep" quiet disabled={busy !== null} onPress={() => setRemoving(null)} />
          </View>
        </View>
      ) : (
        <Row key={g.id} title="Google" detail={g.label ?? 'Google account'}>
          {g.removable ? (
            <Pressable onPress={() => { setNote(null); setRemoving(g.id); }} disabled={busy !== null} accessibilityRole="button" accessibilityLabel={`Remove ${g.label ?? 'Google account'}`} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
              <Txt v="small" style={{ color: c.ink2, fontFamily: 'Manrope_700Bold' }}>Remove</Txt>
            </Pressable>
          ) : state(true)}
        </Row>
      ))}
      {list !== undefined && canAdd && (
        <Action
          label={busy === 'add' ? 'Opening Google…' : googles.length ? 'Add another Google account' : 'Add Google'}
          detail="Then Google opens this same account on any device, even if its email is different."
          disabled={busy !== null}
          onPress={add}
        />
      )}
      {confirming && (
        <View style={{ marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: c.s1, gap: 10 }} accessibilityLiveRegion="polite">
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Confirm it’s you</Txt>
          <Txt v="small" c="ink2">Before adding a new way in, sign in again with one you already have. This keeps someone with your unlocked device from adding their own Google account.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {methods.apple && appleHere && <Button label={busy === 'confirm' ? 'Confirming…' : 'Continue with Apple'} disabled={busy !== null} onPress={() => confirmWith('apple')} />}
            {googles.length > 0 && <Button label="Continue with Google" quiet={methods.apple && appleHere} disabled={busy !== null} onPress={() => confirmWith('google')} />}
            {!(methods.apple && appleHere) && googles.length === 0 && <Button label="Sign out to sign in again" disabled={busy !== null} onPress={async () => { await signOut(); }} />}
            <Button label="Not now" quiet disabled={busy !== null} onPress={() => setConfirming(false)} />
          </View>
        </View>
      )}
      {note ? <Txt v="small" style={{ marginTop: 10, marginBottom: 6, color: note.tone === 'error' ? c.down : c.ink2 }} accessibilityLiveRegion="polite">{note.text}</Txt> : null}
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
  const signOut = usePhoneSignOut();
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
