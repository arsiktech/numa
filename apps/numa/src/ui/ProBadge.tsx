import { View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { Txt } from './Txt';

/** The PRO badge beside the wordmark: a flat surface chip, the same size everywhere. */
export function ProBadge() {
  const { c } = useTheme();
  return (
    <View style={{ paddingHorizontal: space[2], borderRadius: radius.pill, backgroundColor: c.s2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Txt v="label" c="ink" allowFontScaling={false}>Pro</Txt>
    </View>
  );
}
