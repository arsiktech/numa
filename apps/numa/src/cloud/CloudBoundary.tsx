import { usePhoneSignOut } from '@/alerts/signOut';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { isAuthGone } from '@/cloud/authErrors';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';

type Props = { children: ReactNode; onAuthGone: () => void; fallback: (retry: () => void) => ReactNode; ended: ReactNode };

class Boundary extends Component<Props, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown, _info: ErrorInfo) { if (isAuthGone(error)) this.props.onAuthGone(); }
  retry = () => this.setState({ error: null });
  render() {
    if (this.state.error === null) return this.props.children;
    return isAuthGone(this.state.error) ? this.props.ended : this.props.fallback(this.retry);
  }
}

function Failed({ retry }: { retry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }} accessibilityRole="alert">
      <Txt v="title" style={{ textAlign: 'center' }}>Couldn’t load your money</Txt>
      <Txt v="body" c="ink2" style={{ textAlign: 'center', maxWidth: 360 }}>Numa didn’t get an answer. Your data is safe. Check your connection and try again.</Txt>
      <Pressable onPress={retry} accessibilityRole="button" style={{ marginTop: 8, minHeight: 48, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.bg }}>Try again</Txt>
      </Pressable>
    </View>
  );
}

/**
 * Shown while an ended session signs out, until the sign-in screen replaces it. Signing out needs the server
 * once, so without a connection it can wait; the button tries again.
 */
export function SessionEnded({ signOut }: { signOut: () => Promise<void> }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const again = () => { setBusy(true); void signOut().catch(() => undefined).finally(() => setBusy(false)); };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }} accessibilityRole="alert">
      <Txt v="title" style={{ textAlign: 'center' }}>You’re signed out</Txt>
      <Pressable onPress={again} disabled={busy} accessibilityRole="button" accessibilityState={{ busy }} style={{ marginTop: 8, minHeight: 48, minWidth: 140, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink }}>
        {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.bg }}>Sign in again</Txt>}
      </Pressable>
    </View>
  );
}

/** Wraps signed-in screens. If the session is gone, sign out cleanly instead of showing a broken or blank screen. */
export function CloudBoundary({ children }: { children: ReactNode }) {
  const signOut = usePhoneSignOut();
  return <Boundary onAuthGone={() => { void signOut().catch(() => undefined); }} fallback={(retry) => <Failed retry={retry} />} ended={<SessionEnded signOut={signOut} />}>{children}</Boundary>;
}
