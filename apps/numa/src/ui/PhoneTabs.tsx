import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { IconPlus } from './icons';
import { Txt } from './Txt';

// The bottom accessory, a glass bar above the tab bar, exists from iOS 26.
const hasAccessory = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

const openAsk = () => router.push('/ask');

/** The plus as a glass bar above the tabs. When the tab bar shrinks on scroll it sits inline and shortens to "Ask". */
function AskAccessory() {
  const { c } = useTheme();
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const inline = placement === 'inline';
  return (
    <Pressable onPress={openAsk} testID="ask-or-add" accessibilityRole="button" accessibilityLabel="Ask or add"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: inline ? 12 : 18 }}>
      <IconPlus color={c.ink} />
      {/* The system bar has a fixed height, so the label can't grow with it. */}
      <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold', flexShrink: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>{inline ? 'Ask' : 'Ask or add anything'}</Txt>
    </Pressable>
  );
}

/** Before iOS 26 and on Android: the round plus floats above the system tab bar. */
function FloatingPlus() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bar = Platform.OS === 'android' ? 80 : 49;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 20, bottom: insets.bottom + bar + 14 }}>
      <Pressable onPress={openAsk} testID="ask-or-add" accessibilityRole="button" accessibilityLabel="Ask or add"
        style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.plus, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <IconPlus color={c.plusInk} />
      </Pressable>
    </View>
  );
}

/**
 * Phones use the system tab bar: Liquid Glass on iOS 26, which shrinks as you scroll down,
 * and Material on Android. Screens keep their own safe-area padding, so automatic insets are off.
 */
export function PhoneTabs() {
  const { c } = useTheme();
  return (
    <>
      <NativeTabs tintColor={c.ink} minimizeBehavior="onScrollDown">
        <NativeTabs.Trigger name="index" testID="tab-home" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="show_chart" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="flow" testID="tab-flow" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Flow</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="arrow.left.arrow.right" md="swap_horiz" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="plan" testID="tab-plan" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="target" md="track_changes" />
        </NativeTabs.Trigger>
        {hasAccessory ? (
          <NativeTabs.BottomAccessory>
            <AskAccessory />
          </NativeTabs.BottomAccessory>
        ) : null}
      </NativeTabs>
      {hasAccessory ? null : <FloatingPlus />}
    </>
  );
}
