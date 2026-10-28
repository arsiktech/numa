import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { usePushTaps } from '@/alerts/push';
import { ActiveDayTracker } from '@/activity/useActiveDay';
import { CloudBoundary } from '@/cloud/CloudBoundary';
import { CloudProvider } from '@/cloud/CloudProvider';
import { useSession } from '@/cloud/session';
import { CloudDataProvider } from '@/data/cloud';
import { PrefsProvider } from '@/state/prefs';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { useLiveUpdates } from '@/updates/useLiveUpdates';
import { WIDE } from '@/ui/Nav';
import { OfflineNotice } from '@/ui/Offline';
import { CloudMoversProvider, MoversProvider } from '@/ui/MoversContext';
import { clearWidget, WidgetSync } from '@/widget/WidgetSync';
import { ToastProvider } from '@/ui/Toast';

SplashScreen.preventAutoHideAsync();

// A page opened straight from its address (a reload, a bookmark, a link) gets Home beneath it, so a
// detail shown as a panel on wide screens never sits beside an empty page, and Back goes Home.
export const unstable_settings = { initialRouteName: '(tabs)' };

function Root() {
  const { name, c } = useTheme();
  const session = useSession();
  const loading = session.kind === 'loading';
  usePushTaps();
  useLiveUpdates();
  const signedOut = session.kind === 'signedOut';
  useEffect(() => { if (signedOut) clearWidget(); }, [signedOut]);
  useEffect(() => {
    if (!loading) {
      SplashScreen.hide();
      if (Platform.OS === 'web') document.getElementById('numa-startup')?.remove();
    }
  }, [loading]);
  // Wide screens open details as a panel over the page they came from, which stays visible.
  const wide = useWindowDimensions().width >= WIDE;
  if (loading) return null;
  const inside = session.kind !== 'signedOut';
  const panel = wide ? { presentation: 'transparentModal' as const, animation: 'fade' as const, contentStyle: { backgroundColor: 'transparent' } } : {};
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={inside}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ask" options={wide ? panel : { presentation: 'modal' }} />
        <Stack.Screen name="movers" options={wide ? panel : { presentation: 'modal' }} />
        <Stack.Screen name="settings" options={panel} />
        <Stack.Screen name="holdings/index" options={panel} />
        <Stack.Screen name="holdings/[group]" options={panel} />
        <Stack.Screen name="position/[group]/[key]" options={panel} />
        <Stack.Screen name="day/[t]" options={panel} />
        <Stack.Screen name="item/[type]/[id]" options={panel} />
        <Stack.Screen name="loan/[key]" options={panel} />
        <Stack.Screen name="money-map" options={panel} />
        <Stack.Screen name="earnings" options={panel} />
        <Stack.Screen name="person/[key]" options={panel} />
        <Stack.Screen name="tx/[id]" options={panel} />
        <Stack.Screen name="import" options={panel} />
        <Stack.Screen name="password" options={panel} />
        <Stack.Screen name="delete-account" options={panel} />
      </Stack.Protected>
      <Stack.Protected guard={!inside}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <ToastProvider>{session.kind === 'signedIn' ? <CloudBoundary><ActiveDayTracker /><CloudDataProvider><CloudMoversProvider>{stack}<OfflineNotice /><WidgetSync /></CloudMoversProvider></CloudDataProvider></CloudBoundary> : <MoversProvider scope={session.kind} evidence={session.kind}>{stack}</MoversProvider>}</ToastProvider>
    </>
  );
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium,
  });
  // A font that fails to load falls back to the system font rather than leaving a blank screen.
  if (Platform.OS !== 'web' && !loaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PrefsProvider>
        <CloudProvider>
          <ThemeProvider>
            <Root />
          </ThemeProvider>
        </CloudProvider>
      </PrefsProvider>
    </GestureHandlerRootView>
  );
}
