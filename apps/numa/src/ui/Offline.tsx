import { useConvexConnectionState } from 'convex/react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/** A quiet notice when the live connection to Numa drops for more than a few seconds. It sits above the phone nav. */
export function OfflineNotice() {
  const state = useConvexConnectionState();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const offline = state.hasEverConnected && !state.isWebSocketConnected;
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!offline) return;
    const t = setTimeout(() => setLate(true), 3000);
    return () => { clearTimeout(t); setLate(false); };
  }, [offline]);
  if (!offline || !late) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: insets.bottom + 104, left: 16, right: 16, alignItems: 'center' }}>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.s2, borderWidth: 1, borderColor: c.line2 }}>
        <Txt v="small" style={{ fontFamily: 'Manrope_600SemiBold' }}>Offline. Figures may be out of date until you reconnect.</Txt>
      </View>
    </View>
  );
}
