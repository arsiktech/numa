import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';

export default function Screen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 150 }}>
      <Txt v="title" accessibilityRole="header">Flow</Txt>
      <View style={{ marginTop: 12, padding: 16, borderRadius: 20, backgroundColor: c.s1 }}>
        <Txt v="body" c="ink2">Where money came from and where it went, with the stream you can follow. This screen comes in the next build slice.</Txt>
      </View>
    </ScrollView>
  );
}
