import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { usePushTaps } from '@/alerts/push';
import { ActiveDayTracker } from '@/activity/useActiveDay';
import { NavigationWriterProvider } from '@/data/NavigationWriter';
import { CloudBoundary } from '@/cloud/CloudBoundary';
import { CloudProvider } from '@/cloud/CloudProvider';
import { useSession } from '@/cloud/session';
import { CloudDataProvider } from '@/data/cloud';
import { PrefsProvider } from '@/state/prefs';
import { useAppFonts } from '@/theme/fonts';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { useLiveUpdates } from '@/updates/useLiveUpdates';
import { WIDE } from '@/ui/Nav';
import { OfflineNotice } from '@/ui/Offline';
import { CloudMoversProvider, MoversProvider } from '@/ui/MoversContext';
import { clearWidget, WidgetSync } from '@/widget/WidgetSync';
import { GestureRoot } from '@/ui/GestureRoot';
import { FeedbackButton } from '@/feedback/FeedbackButton';
import { ToastProvider } from '@/ui/Toast';
import { isKnownPath, routeMeta } from './routes';

SplashScreen.preventAutoHideAsync();

// A page opened straight from its address (a reload, a bookmark, a link) gets Home beneath it, so a
// detail shown as a panel on wide screens never sits beside an empty page, and Back goes Home.
export const unstable_settings = { initialRouteName: '(tabs)' };

function hideStartup() {
  if (Platform.OS === 'web') document.getElementById('numa-startup')?.remove();
}

function Root() {
  const { name, c } = useTheme();
  const session = useSession();
  const path = usePathname();
  const known = Platform.OS !== 'web' || isKnownPath(path);
  const loading = session.kind === 'loading';
  usePushTaps();
  useLiveUpdates();
  const signedOut = session.kind === 'signedOut';
  useEffect(() => { if (signedOut) clearWidget(); }, [signedOut]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const meta = routeMeta(known ? path : '/missing');
    document.title = `${meta.title} · Numa Pro`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute('content', meta.description);
    let og = document.querySelector('meta[property="og:title"]');
    if (!og) {
      og = document.createElement('meta');
      og.setAttribute('property', 'og:title');
      document.head.appendChild(og);
    }
    og.setAttribute('content', `${meta.title} · Numa Pro`);
  }, [known, path]);
  useEffect(() => {
    if (!loading || !known) {
      SplashScreen.hide();
      hideStartup();
    }
  }, [loading, known]);
  // Wide screens open details as a panel over the page they came from, which stays visible.
  const wide = useWindowDimensions().width >= WIDE;
  if (loading && known) return null;
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
      <Stack.Screen name="auth" />
      <Stack.Protected guard={!inside}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <ToastProvider>
        {session.kind === 'signedIn' ? <CloudBoundary><ActiveDayTracker /><CloudDataProvider><NavigationWriterProvider><CloudMoversProvider>{stack}<OfflineNotice /><WidgetSync /></CloudMoversProvider></NavigationWriterProvider></CloudDataProvider></CloudBoundary> : <MoversProvider scope={session.kind} evidence={session.kind}>{stack}</MoversProvider>}
        <FeedbackButton />
      </ToastProvider>
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  if (!fontsReady) return null;
  return (
    <PrefsProvider>
      <CloudProvider>
        <ThemeProvider>
          <GestureRoot>
            <Root />
          </GestureRoot>
        </ThemeProvider>
      </CloudProvider>
    </PrefsProvider>
  );
}
