import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/** A pushed screen: back on the left, a centred column up to 720 px on wide screens. */
export function Screen({ children, back = 'Back' }: { children: ReactNode; back?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel={back} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>‹ {back}</Txt>
        </Pressable>
        {children}
      </View>
    </ScrollView>
  );
}
