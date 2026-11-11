import { View, type DimensionValue } from 'react-native';

import { useTheme } from '@/theme/theme';

/** Gray blocks that hold a page’s place while its numbers load. */
export function SkeletonBlocks() {
  const { c } = useTheme();
  const block = (height: number, width: DimensionValue, marginTop: number) => <View style={{ height, width, marginTop, borderRadius: 10, backgroundColor: c.s2 }} />;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      {block(28, 180, 8)}
      {block(54, 260, 16)}
      {block(160, '100%', 24)}
      {block(96, '100%', 24)}
    </View>
  );
}
