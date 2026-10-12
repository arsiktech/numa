import { useAuthActions } from '@convex-dev/auth/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cloudEnabled } from '@/cloud/CloudProvider';
import { useSession } from '@/cloud/session';
import { usePrefs, type ThemeChoice } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { ProBadge } from '@/ui/ProBadge';
import { Txt } from '@/ui/Txt';

function Row({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ minHeight: 60, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1 }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{title}</Txt>
        {detail ? <Txt v="small" c="ink2" style={{ marginTop: 2 }}>{detail}</Txt> : null}
      </View>
      {children}
    </View>
  );
}

function SignOut() {
  const { signOut } = useAuthActions();
  const [busy, setBusy] = useState(false);
  return <Action label={busy ? 'Signing out…' : 'Sign out'} danger onPress={async () => { setBusy(true); try { await signOut(); } finally { setBusy(false); } }} />;
}

function Action({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: danger ? c.down : c.ink }}>{label}</Txt>
    </Pressable>
  );
}

/** Appearance, privacy and the account. Device preferences stay on this device. */
export default function Settings() {
  const { c, choice, setChoice } = useTheme();
  const insets = useSafeAreaInsets();
  const { hideAmounts, set } = usePrefs();
  const session = useSession();
  const themes: { id: ThemeChoice; label: string }[] = [{ id: 'auto', label: 'Auto' }, { id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
      <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" style={{ height: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>‹ Back</Txt>
        </Pressable>
        <Txt v="title" accessibilityRole="header" style={{ marginTop: 8 }}>Settings</Txt>

        <Txt v="label" c="ink3" style={{ marginTop: 28 }}>APPEARANCE</Txt>
        <Row title="Theme" detail="Auto follows your device.">
          <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: c.s1 }} accessibilityRole="radiogroup">
            {themes.map((t) => (
              <Pressable key={t.id} onPress={() => setChoice(t.id)} accessibilityRole="radio" accessibilityState={{ checked: choice === t.id }} style={{ minWidth: 56, height: 34, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: choice === t.id ? c.s2 : 'transparent' }}>
                <Txt v="small" c={choice === t.id ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>{t.label}</Txt>
              </Pressable>
            ))}
          </View>
        </Row>
        <Row title="Hide amounts" detail="Replaces every figure with dots, for screens in public.">
          <Switch value={hideAmounts} onValueChange={(v) => set('hideAmounts', v)} trackColor={{ true: c.up, false: c.s2 }} thumbColor="#FFFFFF" accessibilityLabel="Hide amounts" />
        </Row>

        <Txt v="label" c="ink3" style={{ marginTop: 28 }}>ACCOUNT</Txt>
        {session.kind === 'signedIn' ? (
          <>
            <Row title="Signed in" detail="Your data lives in your Numa account and syncs across devices." />
            <SignOut />
          </>
        ) : (
          <>
            <Row title="Demo data" detail="You’re looking at a made-up portfolio. Nothing here is saved." />
            {cloudEnabled && <Action label="Sign in or create an account" onPress={() => set('demo', false)} />}
          </>
        )}

        <View style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel="Numa Pro">
          <Txt v="title" style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.8 }}>numa</Txt>
          <ProBadge />
        </View>
        <Txt v="small" c="ink3" style={{ marginTop: 6 }}>Numa never moves money. Prices and exchange rates can be delayed.</Txt>
      </View>
    </ScrollView>
  );
}
