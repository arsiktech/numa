import { Platform, Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/** Reads "12,500.5" back into cents; returns null for anything that is not a plain amount. */
export function toCents(text: string): number | null {
  const clean = text.replace(/[\s,€$]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function Field({ label, value, onChangeText, numeric }: { label: string; value: string; onChangeText: (t: string) => void; numeric?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 120 }}>
      <Txt v="small" c="ink3">{label}</Txt>
      <TextInput value={value} onChangeText={onChangeText} accessibilityLabel={label} keyboardType={numeric ? 'decimal-pad' : 'default'} inputMode={numeric ? 'decimal' : 'text'}
        style={{ height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.s2, color: c.ink, fontFamily: numeric ? 'JetBrainsMono_500Medium' : 'Manrope_500Medium', fontSize: 15, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
    </View>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: c.s2, alignSelf: 'flex-start' }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ checked: value === v }} style={{ minWidth: 56, height: 32, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: value === v ? c.bg : 'transparent' }}>
          <Txt v="small" c={value === v ? 'ink' : 'ink3'} style={{ fontFamily: 'Manrope_700Bold' }}>{l}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

