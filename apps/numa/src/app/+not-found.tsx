import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { PressableLink } from '@/ui/PressableLink';
import { Txt } from '@/ui/Txt';

/** Unknown addresses leave the startup splash and show this screen. */
export default function NotFound() {
  const { c } = useTheme();
  useEffect(() => {
    if (Platform.OS === 'web') document.getElementById('numa-startup')?.remove();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 420, gap: 16 }}>
        <Txt v="title" accessibilityRole="header">Page could not be found</Txt>
        <Txt v="body" c="ink2">That address is not in Numa Pro.</Txt>
        <PressableLink href="/" look={(pressed) => ({ alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: 24, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}>
          <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Go to Numa Pro</Txt>
        </PressableLink>
      </View>
    </View>
  );
}
