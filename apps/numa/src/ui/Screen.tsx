import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { ClosePanels, PanelFrame, usePanel } from './Panel';
import { Txt } from './Txt';

/**
 * A pushed screen: back on the left. On phones it fills the screen; on wide screens it is a panel on the
 * right, beside the page it was opened from, with a close button.
 */
export function Screen({ children, back = 'Back' }: { children: ReactNode; back?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const panel = usePanel();
  return (
    <PanelFrame>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + (panel ? 40 : 120), paddingHorizontal: panel ? 24 : 20 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel={back} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
              <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>‹ {back}</Txt>
            </Pressable>
            {panel && <ClosePanels />}
          </View>
          {children}
        </View>
      </ScrollView>
    </PanelFrame>
  );
}
