import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cloudEnabled } from '@/cloud/CloudProvider';
import { useSession } from '@/cloud/session';
import { AccountSection, DataSection, DeletionBanner } from '@/settings/AccountSection';
import { AgentSection } from '@/settings/AgentSection';
import { AlertsSection } from '@/settings/AlertsSection';
import { Action, Row, Section } from '@/settings/rows';
import { SpaceSection } from '@/settings/SpaceSection';
import { WalletSection } from '@/settings/WalletSection';
import { usePrefs, type ThemeChoice } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { ProBadge } from '@/ui/ProBadge';
import { ClosePanels, PanelFrame, usePanel } from '@/ui/Panel';
import { Txt } from '@/ui/Txt';

/** Appearance, privacy and the account. Device preferences stay on this device. */
export default function Settings() {
  const { c, choice, setChoice } = useTheme();
  const insets = useSafeAreaInsets();
  const { hideAmounts, set } = usePrefs();
  const session = useSession();
  const panel = usePanel();
  const themes: { id: ThemeChoice; label: string }[] = [{ id: 'auto', label: 'Auto' }, { id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }];

  return (
    <PanelFrame>
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
      <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>‹ Back</Txt>
          </Pressable>
          {panel && <ClosePanels />}
        </View>
        <Txt v="title" accessibilityRole="header" style={{ marginTop: 8 }}>Settings</Txt>
        {session.kind === 'signedIn' && <DeletionBanner />}
        {session.kind === 'signedIn' && <SpaceSection />}
        {session.kind === 'signedIn' && <AgentSection />}

        <Section title="APPEARANCE" />
        <Row title="Theme" detail="Auto follows your device.">
          <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: c.s1 }} accessibilityRole="radiogroup">
            {themes.map((t) => (
              <Pressable key={t.id} onPress={() => setChoice(t.id)} accessibilityRole="radio" aria-checked={choice === t.id} style={{ minWidth: 56, minHeight: 34, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: choice === t.id ? c.s2 : 'transparent' }}>
                <Txt v="small" c={choice === t.id ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>{t.label}</Txt>
              </Pressable>
            ))}
          </View>
        </Row>
        <Row title="Hide amounts" detail="Replaces every figure with dots, for screens in public.">
          <Switch value={hideAmounts} onValueChange={(v) => set('hideAmounts', v)} trackColor={{ true: c.up, false: c.s2 }} thumbColor="#FFFFFF" accessibilityLabel="Hide amounts" />
        </Row>

        {session.kind === 'signedIn' ? (
          <>
            <AlertsSection />
            <WalletSection />
            <DataSection />
            <AccountSection />
          </>
        ) : (
          <>
            <Section title="ACCOUNT" />
            <Row title="Demo data" detail="You’re looking at a made-up portfolio. Nothing here is saved." />
            {cloudEnabled && <Action label="Sign in or create an account" onPress={() => set('demo', false)} />}
          </>
        )}

        <View style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel="Numa Pro">
          <Txt v="title" style={{ fontSize: 20, lineHeight: 24, letterSpacing: -0.8 }}>numa</Txt>
          <ProBadge />
        </View>
        <Txt v="small" c="ink3" style={{ marginTop: 6 }}>Numa Pro {Constants.expoConfig?.version ?? ''}. Numa never moves money. Prices and exchange rates can be delayed.</Txt>
      </View>
    </ScrollView>
    </PanelFrame>
  );
}
