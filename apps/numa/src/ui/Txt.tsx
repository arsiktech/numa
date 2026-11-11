import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { webFont } from '@/theme/webFont';

import { useTheme } from '@/theme/theme';
import { type as typeScale, type Palette } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

/** Web type follows the root font size, so a larger text setting enlarges the UI. */
function scaleForWeb(style: TextStyle): TextStyle {
  if (Platform.OS !== 'web') return style;
  const rem = (px: number) => `${px / 16}rem` as unknown as number;
  const next: TextStyle = { ...style };
  if (typeof next.fontSize === 'number') next.fontSize = rem(next.fontSize);
  if (typeof next.lineHeight === 'number') next.lineHeight = rem(next.lineHeight);
  if (typeof next.letterSpacing === 'number') next.letterSpacing = rem(next.letterSpacing);
  return next;
}

export function Txt({ v = 'body', c = 'ink', style, fbPrivate, ...rest }: TextProps & { v?: Variant; c?: keyof Palette; fbPrivate?: boolean }) {
  const { c: p } = useTheme();
  const base: TextStyle = { ...typeScale[v], color: p[c] };
  if (v === 'figure' || v === 'figureSm' || v === 'hero' || v === 'display' || v === 'cents') base.fontVariant = ['tabular-nums'];
  if (v === 'label') base.textTransform = 'uppercase';
  const styles = [base, style];
  const privacy = fbPrivate && Platform.OS === 'web' ? { dataSet: { fbPrivate: true } } : undefined;
  if (Platform.OS === 'web') {
    const resolved = scaleForWeb(StyleSheet.flatten(styles));
    return <Text {...rest} {...privacy} style={{ ...resolved, fontFamily: webFont(resolved.fontFamily) }} />;
  }
  return <Text {...rest} style={styles} />;
}
