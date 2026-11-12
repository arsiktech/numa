import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { Txt } from './Txt';

/**
 * A card on Home that opens a fuller screen: title and an optional figure on one line, then
 * its content. Every Home card shares this frame, so they line up in the grid.
 */
export function TeaserCard({ title, aside, onPress, accessibilityLabel, style, children }: {
  title: string; aside?: ReactNode; onPress: () => void; accessibilityLabel: string;
  style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{ padding: space[4], gap: space[3], borderRadius: radius.card, backgroundColor: c.s2, opacity: pressed ? 0.72 : 1 }, style]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: space[3] }}>
        <Txt v="cardTitle">{title} <Txt v="body" c="ink2">›</Txt></Txt>
        {aside}
      </View>
      {children}
    </Pressable>
  );
}
