import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { webFont } from '@/theme/webFont';

import { useTheme } from '@/theme/theme';
import { type as typeScale, type Palette } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

export function Txt({ v = 'body', c = 'ink', style, ...rest }: TextProps & { v?: Variant; c?: keyof Palette }) {
  const { c: p } = useTheme();
  const base: TextStyle = { ...typeScale[v], color: p[c] };
  if (v === 'figure' || v === 'figureSm' || v === 'hero' || v === 'display' || v === 'cents') base.fontVariant = ['tabular-nums'];
  if (v === 'label') base.textTransform = 'uppercase';
  const styles = [base, style];
  if (Platform.OS === 'web') {
    const resolved = StyleSheet.flatten(styles);
    return <Text {...rest} style={{ ...resolved, fontFamily: webFont(resolved.fontFamily) }} />;
  }
  return <Text {...rest} style={styles} />;
}
