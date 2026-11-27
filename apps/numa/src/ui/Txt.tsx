import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { webFont } from '@/theme/webFont';

import { useTheme } from '@/theme/theme';
import { type as typeScale, type Palette } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

/** Web type follows the root font size, so a larger text setting enlarges the UI. */
function scaleForWeb(style: TextStyle): TextStyle {
  if (Platform.OS !== 'web') return style;
  const rem = (px: number) => `${px / 16}rem` as unknown as number;
  return {
    ...style,
    ...(typeof style.fontSize === 'number' ? { fontSize: rem(style.fontSize) } : null),
    ...(typeof style.lineHeight === 'number' ? { lineHeight: rem(style.lineHeight) } : null),
    ...(typeof style.letterSpacing === 'number' ? { letterSpacing: rem(style.letterSpacing) } : null),
  };
}

export function Txt({ v = 'body', c = 'ink', style, ...rest }: TextProps & { v?: Variant; c?: keyof Palette }) {
  const { c: p } = useTheme();
  const tabular = v === 'figure' || v === 'figureSm' || v === 'hero' || v === 'display' || v === 'cents';
  const base: TextStyle = {
    ...typeScale[v],
    color: p[c],
    ...(tabular ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null),
    ...(v === 'label' ? { textTransform: 'uppercase' as const } : null),
  };
  const styles = [base, style];
  if (Platform.OS === 'web') {
    const resolved = scaleForWeb(StyleSheet.flatten(styles) ?? {});
    return <Text {...rest} style={{ ...resolved, fontFamily: webFont(resolved.fontFamily) }} />;
  }
  return <Text {...rest} style={styles} />;
}
