import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { type as typeScale, type Palette } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

export function Txt({ v = 'body', c = 'ink', style, ...rest }: TextProps & { v?: Variant; c?: keyof Palette }) {
  const { c: p } = useTheme();
  const base: TextStyle = { ...typeScale[v], color: p[c] };
  if (v === 'figure' || v === 'figureSm' || v === 'hero' || v === 'display' || v === 'cents') base.fontVariant = ['tabular-nums'];
  if (v === 'label') base.textTransform = 'uppercase';
  return <Text {...rest} style={[base, style]} />;
}
