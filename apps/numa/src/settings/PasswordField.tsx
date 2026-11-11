import { Platform, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';

export function PasswordField({ label, value, onChangeText, autoComplete, onSubmitEditing }: { label: string; value: string; onChangeText: (t: string) => void; autoComplete: 'current-password' | 'new-password' | 'off'; onSubmitEditing?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Txt v="small" c="ink3">{label}</Txt>
      <TextInput value={value} onChangeText={onChangeText} accessibilityLabel={label} secureTextEntry={autoComplete !== 'off'} autoComplete={autoComplete} autoCapitalize="none" autoCorrect={false} onSubmitEditing={onSubmitEditing}
        style={{ minHeight: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: c.s2, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 16, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
    </View>
  );
}
