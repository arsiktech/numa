import { Link, router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, type ReactNode } from 'react';
import { Platform, Pressable, View, useWindowDimensions, type View as RNView, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { WIDE, panelWidth, usePanelOpen } from './Panel';
import { IconAsk, IconFlow, IconHoldings, IconHome, IconPlan, IconPlus } from './icons';
import { ProBadge } from './ProBadge';
import { Txt } from './Txt';

export { WIDE };

const routes = [
  { name: 'index', href: '/', label: 'Home', Icon: IconHome },
  { name: 'flow', href: '/flow', label: 'Flow', Icon: IconFlow },
  { name: 'plan', href: '/plan', label: 'Plan', Icon: IconPlan },
] as const;

type ItemProps = TabTriggerSlotProps & { label: string; icon: (color: string) => ReactNode; wide: boolean };

const NavItem = forwardRef<RNView, ItemProps>(function NavItem({ isFocused, label, icon, wide, ...props }, ref) {
  const { c } = useTheme();
  const color = isFocused ? c.ink : c.ink3;
  if (wide) {
    return (
      // A place in the sidebar closes any open panel, so the page it opens is the one in view.
      <Pressable ref={ref} {...props} onPress={(e) => { if (router.canDismiss()) router.dismissAll(); props.onPress?.(e); }} accessibilityRole="link" aria-selected={isFocused} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: isFocused ? c.s2 : 'transparent' }}>
        {icon(color)}
        <Txt v="body" style={{ color, fontFamily: 'Manrope_600SemiBold' }}>{label}</Txt>
      </Pressable>
    );
  }
  return (
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityLabel={label} aria-selected={isFocused} style={{ width: 60, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: isFocused ? c.s2 : 'transparent' }}>
      {icon(color)}
    </Pressable>
  );
});

export function Wordmark() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12 }} accessible accessibilityLabel="Numa Pro">
      <Txt v="title" style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.9 }}>numa</Txt>
      <ProBadge />
    </View>
  );
}

/** The small mark for the top of a phone screen, so it is always clear which app this is. */
export function MiniWordmark() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }} accessible accessibilityRole="header" accessibilityLabel="Numa Pro">
      <Txt v="title" style={{ fontSize: 19, lineHeight: 24, letterSpacing: -0.8 }} maxFontSizeMultiplier={1.3}>numa</Txt>
      <ProBadge size={15} />
    </View>
  );
}

type ContainerProps = ViewProps & { wide: boolean; bottom: number };

/** Receives TabList's props through asChild, so the triggers stay direct descendants the router can find. */
const NavContainer = forwardRef<RNView, ContainerProps>(function NavContainer({ wide, bottom, style, children, ...props }, ref) {
  const { c } = useTheme();
  if (wide) {
    return (
      <View ref={ref} {...props} style={[style, { width: 236, paddingVertical: 26, paddingHorizontal: 14, gap: 2, borderRightWidth: 1, borderRightColor: c.line, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }]}>
        {children}
      </View>
    );
  }
  const glass = Platform.OS === 'web' ? ({ backdropFilter: 'blur(22px) saturate(1.4)' } as object) : {};
  return (
    <View ref={ref} {...props} style={[style, { position: 'absolute', zIndex: 10, elevation: 10, left: 20, right: 92, bottom, height: 62, borderRadius: 31, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }, glass]}>
      {children}
    </View>
  );
});

/** Phone: a floating glass capsule with three places and the round plus. Wide screens: a sidebar. */
export function AppTabs() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= WIDE;
  const panelOpen = usePanelOpen();
  const bottom = Math.max(insets.bottom, 10) + 16;

  return (
    <Tabs style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: c.bg }}>
      <TabList asChild>
        <NavContainer wide={wide} bottom={bottom}>
          {wide ? <Wordmark /> : null}
          {wide ? <View style={{ height: 24 }} /> : null}
          {routes.map((r) => (
            <TabTrigger key={r.name} name={r.name} href={r.href} asChild>
              <NavItem label={r.label} icon={(col) => <r.Icon color={col} size={wide ? 20 : 22} />} wide={wide} />
            </TabTrigger>
          ))}
          {wide ? (
            <Link href="/holdings" asChild>
              <Pressable accessibilityRole="link" style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12 }}>
                <IconHoldings color={c.ink3} />
                <Txt v="body" c="ink3" style={{ fontFamily: 'Manrope_600SemiBold' }}>Holdings</Txt>
              </Pressable>
            </Link>
          ) : null}
          {wide ? (
            <Link href="/ask" asChild>
              <Pressable accessibilityRole="link" style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12 }}>
                <IconAsk color={c.ink3} />
                <Txt v="body" c="ink3" style={{ fontFamily: 'Manrope_600SemiBold' }}>Ask or add</Txt>
              </Pressable>
            </Link>
          ) : null}
        </NavContainer>
      </TabList>
      <TabSlot style={{ flex: 1, marginRight: wide && panelOpen ? panelWidth(width) : 0 }} />
      {!wide ? (
        <Pressable onPress={() => router.push('/ask')} accessibilityRole="button" accessibilityLabel="Ask or add" style={{ position: 'absolute', zIndex: 10, elevation: 10, right: 20, bottom, width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: c.plus, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
          <IconPlus color={c.plusInk} />
        </Pressable>
      ) : null}
    </Tabs>
  );
}
