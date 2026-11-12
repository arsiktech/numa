import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { Txt } from './Txt';

/**
 * A card on Home that opens a fuller screen: title and an optional figure on one line, then
 * its content. Every Home card shares this frame, so they line up in the grid. It is a real
 * link with an href, so Enter opens it on the web. `Link asChild` hands its child's style straight to the
 * DOM there, which accepts neither a style function nor an array, so the style is flattened.
 */
export function TeaserCard({ title, aside, href, accessibilityLabel, style, children }: {
  title: string; aside?: ReactNode; href: Href; accessibilityLabel: string;
  style?: StyleProp<ViewStyle>; children: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel}
        style={StyleSheet.flatten([{ padding: space[4], gap: space[3], borderRadius: radius.card, backgroundColor: c.s2 }, style])}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: space[3] }}>
          <Txt v="cardTitle">{title} <Txt v="body" c="ink2">›</Txt></Txt>
          {aside}
        </View>
        {children}
      </Pressable>
    </Link>
  );
}
