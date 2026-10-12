import { router } from 'expo-router';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';

export default function Ask() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt v="title" accessibilityRole="header">Ask or add</Txt>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
          <Txt v="cardTitle" c="ink2">Close</Txt>
        </Pressable>
      </View>
      <View style={{ marginTop: 16, minHeight: 52, borderRadius: 26, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: c.s1, borderWidth: 1, borderColor: c.line2 }}>
        <TextInput placeholder="Ask or add anything" placeholderTextColor={c.ink3} accessibilityLabel="Ask or add anything" style={{ color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 15 }} />
      </View>
      <Txt v="small" c="ink3" style={{ marginTop: 12 }}>Drafts from words, receipts and screenshots arrive in a later build slice. Nothing is saved from here yet.</Txt>
    </View>
  );
}
