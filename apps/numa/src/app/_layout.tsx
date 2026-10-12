import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CloudBoundary } from '@/cloud/CloudBoundary';
import { CloudProvider } from '@/cloud/CloudProvider';
import { useSession } from '@/cloud/session';
import { CloudDataProvider } from '@/data/cloud';
import { PrefsProvider } from '@/state/prefs';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { OfflineNotice } from '@/ui/Offline';
import { ToastProvider } from '@/ui/Toast';

SplashScreen.preventAutoHideAsync();

function Root() {
  const { name, c } = useTheme();
  const session = useSession();
  const loading = session.kind === 'loading';
  useEffect(() => { if (!loading) SplashScreen.hide(); }, [loading]);
  if (loading) return null;
  const inside = session.kind !== 'signedOut';
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={inside}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ask" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="holdings/index" />
        <Stack.Screen name="holdings/[group]" />
        <Stack.Screen name="item/[type]/[id]" />
        <Stack.Screen name="tx/[id]" />
        <Stack.Screen name="import" />
        <Stack.Screen name="password" />
        <Stack.Screen name="delete-account" />
      </Stack.Protected>
      <Stack.Protected guard={!inside}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <ToastProvider>{session.kind === 'signedIn' ? <CloudBoundary><CloudDataProvider>{stack}<OfflineNotice /></CloudDataProvider></CloudBoundary> : stack}</ToastProvider>
    </>
  );
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium,
  });
  // A font that fails to load falls back to the system font; it must never blank the app.
  if (!loaded && !fontError) return null;
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
