import { Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

import { stepFocus } from './lens';
import { Txt } from './Txt';

/** No resting footprint. This sibling of the clipped drawing stays above the touch surface. */
export function LensReadout({ label, amount, detail, surfaceHeight, inspecting, selected, count, inspect, dismiss, open }: {
  label?: string; amount?: string; detail?: string; surfaceHeight: number; inspecting: boolean;
  selected: number; count: number; inspect: (index: number) => void; dismiss: () => void; open?: () => void;
}) {
  const { c } = useTheme();
  if (selected < 0 || label === undefined) return null;
  return (
    <View testID="lens-readout" pointerEvents={inspecting ? 'none' : 'auto'}
      style={{ position: 'absolute', bottom: surfaceHeight + space[2], left: 0, right: 0, maxHeight: 176, padding: space[2], gap: space[1], borderRadius: radius.bar, borderWidth: 1, borderColor: c.s2, backgroundColor: c.bg, zIndex: 2 }}>
      <ScrollView key={`${selected}:${label}`} nestedScrollEnabled style={{ maxHeight: 108, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: space[1] }}>
        <View accessible accessibilityLabel={[label, amount, detail].filter(Boolean).join('. ')} accessibilityLiveRegion="polite">
          <Txt v="cardTitle">{label}</Txt>
          {amount && <Txt v="figure">{amount}</Txt>}
          {detail && <Txt v="small" c="ink2" style={{ marginTop: space[1] }}>{detail}</Txt>}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Inspect previous tile" disabled={!count} onPress={() => inspect(stepFocus(selected, -1, count))}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Txt v="body" c="ink2">‹</Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Inspect next tile" disabled={!count} onPress={() => inspect(stepFocus(selected, 1, count))}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Txt v="body" c="ink2">›</Txt>
        </Pressable>
        {open && <Pressable accessibilityRole="link" accessibilityLabel={`Open ${label}`} onPress={open}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Txt v="body" c="ink2">↗</Txt></Pressable>}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss tile details" onPress={dismiss}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Txt v="body" c="ink2">×</Txt></Pressable>
      </View>
    </View>
  );
}
