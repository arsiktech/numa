import { Link } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
// The gesture handler's ScrollView lets the chart's sideways scrub and the page's vertical scroll share touches.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { IconEye, IconPerson } from './icons';
import { MiniWordmark, WIDE } from './Nav';
import { Txt } from './Txt';

const APP_ICON = require('../../assets/images/icon.png');

/** Scrolling past this collapses the bar; scrolling back above the lower mark opens it again. */
const COLLAPSE_AT = 48;
const EXPAND_AT = 16;

/** Hide amounts and the profile, the same on every main screen. Demo shows as a pill. */
export function BarButtons({ demo, onDemo, compact }: { demo: boolean; onDemo?: () => void; compact?: boolean }) {
  const { c } = useTheme();
  const { hideAmounts, set } = usePrefs();
  const pill = (
    <View style={{ minHeight: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.s2, justifyContent: 'center' }}>
      <Txt v="label" c="ink2" style={{ fontSize: 10 }} maxFontSizeMultiplier={1.4}>Demo</Txt>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {demo && !compact && (onDemo
        ? <Pressable onPress={onDemo} accessibilityRole="button" accessibilityLabel="Demo data. Sign in" style={{ height: 44, justifyContent: 'center', paddingHorizontal: 4 }}>{pill}</Pressable>
        : <View accessibilityLabel="Demo data" style={{ height: 44, justifyContent: 'center', paddingHorizontal: 4 }}>{pill}</View>)}
      <Pressable onPress={() => set('hideAmounts', !hideAmounts)} accessibilityRole="switch" aria-checked={hideAmounts} accessibilityLabel="Hide amounts" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: hideAmounts ? 0.55 : 1 }}>
        <IconEye color={c.ink} />
      </Pressable>
      <Link href="/settings" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="Settings" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <IconPerson color={c.ink} />
        </Pressable>
      </Link>
    </View>
  );
}

/**
 * A main screen (Home, Flow, Plan). On phones the top bar stays pinned: at the top of the page it
 * shows the numa PRO mark over the screen's own row (lens switch, month, title); once you scroll
 * it folds into one line, with the app's square icon in place of the mark. Wide screens keep the
 * sidebar and render `nav` inline.
 */
export function PinnedScreen({ nav, buttons, children, maxWidth = 1240, keyboard }: {
  nav: (compact: boolean) => ReactNode;
  buttons: (compact: boolean) => ReactNode;
  children: ReactNode;
  maxWidth?: number;
  keyboard?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(0);
  const [compact, setCompact] = useState(false);

  if (wide) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} keyboardShouldPersistTaps={keyboard ? 'handled' : undefined} contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 22, paddingBottom: 60 }}>
        <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>{nav(false)}</View>
            {buttons(false)}
          </View>
          {children}
        </View>
      </ScrollView>
    );
  }

  const layout = reduce ? undefined : LinearTransition.duration(180);
  const fade = (ms: number) => (reduce ? undefined : FadeIn.duration(ms));
  // The scroll view is the screen's root: iOS looks for it there to shrink the tab bar while scrolling down.
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} scrollEventThrottle={16} keyboardShouldPersistTaps={keyboard ? 'handled' : undefined} automaticallyAdjustKeyboardInsets={keyboard}
      onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        if (!compact && y > COLLAPSE_AT) setCompact(true);
        else if (compact && y < EXPAND_AT) setCompact(false);
      }}
      stickyHeaderIndices={[0]}
      scrollIndicatorInsets={{ top: open }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}>
      {/* Keeps the open bar's height, so folding never moves the page; below the folded bar it is see-through. */}
      <View pointerEvents="box-none" style={{ height: compact && open ? open : undefined }}>
        <Animated.View layout={layout}
          onLayout={(e) => { if (!compact) setOpen(Math.round(e.nativeEvent.layout.height)); }}
          style={{ paddingTop: insets.top + 4, paddingHorizontal: 20, paddingBottom: compact ? 6 : 0, backgroundColor: c.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: compact ? c.line2 : 'transparent' }}>
          {compact ? (
            <Animated.View key="compact" entering={fade(160)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: -10 }}>
              <Image source={APP_ICON} accessibilityLabel="Numa Pro" accessibilityRole="image" style={{ width: 28, height: 28, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>{nav(true)}</View>
              {buttons(true)}
            </Animated.View>
          ) : (
            <Animated.View key="open" entering={fade(200)} exiting={reduce ? undefined : FadeOut.duration(80)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10 }}>
                <MiniWordmark />
                {buttons(false)}
              </View>
              {nav(false)}
            </Animated.View>
          )}
        </Animated.View>
      </View>
      <View style={{ paddingTop: 6, paddingHorizontal: 20 }}>
        <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>{children}</View>
      </View>
    </ScrollView>
  );
}
