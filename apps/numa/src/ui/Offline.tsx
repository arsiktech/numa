import { useConvexConnectionState } from 'convex/react';

import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/** Saving must not look available while Convex is disconnected, including before its first connection. */
export function OfflineNotice() {
  const state = useConvexConnectionState();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (state.isWebSocketConnected) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: insets.bottom + 104, left: 16, right: 16, alignItems: 'center' }}>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.s2, borderWidth: 1, borderColor: c.line2 }}>
        <Txt v="small" style={{ fontFamily: 'Manrope_600SemiBold' }}>Offline. Reconnect before saving. Figures may be out of date.</Txt>
      </View>
    </View>
  );
}
