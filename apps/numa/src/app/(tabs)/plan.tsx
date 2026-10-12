import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';

export default function Screen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 150 }}>
      <Txt v="title" accessibilityRole="header">Plan</Txt>
      <View style={{ marginTop: 12, padding: 16, borderRadius: 20, backgroundColor: c.s1 }}>
        <Txt v="body" c="ink2">Road to €1M, what-if sliders, runway and your limits. This screen comes in a later build slice.</Txt>
      </View>
    </ScrollView>
  );
}
