import { Link, router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions, type View as RNView, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { WIDE, panelWidth, usePanelOpen } from './Panel';
import { IconAsk, IconFlow, IconHoldings, IconHome, IconPlan, IconPlus } from './icons';
import { ProBadge } from './ProBadge';
import { Txt } from './Txt';

export { WIDE };

/** The phone capsule's height and the round plus beside it. */
const PLUS = 62;

const routes = [
  { name: 'index', href: '/', label: 'Home', Icon: IconHome },
  { name: 'flow', href: '/flow', label: 'Flow', Icon: IconFlow },
  { name: 'plan', href: '/plan', label: 'Plan', Icon: IconPlan },
] as const;

type ItemProps = TabTriggerSlotProps & { label: string; icon: (color: string) => ReactNode; wide: boolean };

/** One sidebar row. A plain style object: web links built with `asChild` drop a style function, which stacked the icon over the label. */
const sideRow = (selected: boolean, bg: string) => ({
  minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space[3], paddingHorizontal: space[3],
  borderRadius: radius.control, backgroundColor: selected ? bg : 'transparent',
});

function SideLink({ href, label, icon }: { href: '/holdings' | '/ask'; label: string; icon: (color: string) => ReactNode }) {
  const { c } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" style={sideRow(false, c.s2)}>
        {icon(c.ink2)}
        <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_600SemiBold' }}>{label}</Txt>
      </Pressable>
    </Link>
  );
}

const NavItem = forwardRef<RNView, ItemProps>(function NavItem({ isFocused, label, icon, wide, ...props }, ref) {
  const { c } = useTheme();
  const color = isFocused ? c.ink : c.ink2;
  if (wide) {
    return (
      // A place in the sidebar closes any open panel, so the page it opens is the one in view.
      <Pressable ref={ref} {...props} onPress={(e) => { if (router.canDismiss()) router.dismissAll(); props.onPress?.(e); }} accessibilityRole="link" aria-current={isFocused ? 'page' : undefined} style={({ pressed }) => ({ ...sideRow(!!isFocused, c.s2), opacity: pressed ? 0.72 : 1 })}>
        {icon(color)}
        <Txt v="body" style={{ color, fontFamily: 'Manrope_600SemiBold' }}>{label}</Txt>
      </Pressable>
    );
  }
  return (
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityLabel={label} aria-selected={isFocused} style={({ pressed }) => ({ width: 60, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isFocused ? c.s2 : 'transparent', opacity: pressed ? 0.72 : 1 })}>
      {icon(color)}
    </Pressable>
  );
});

export function Wordmark() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3] }} accessible accessibilityLabel="Numa Pro">
      <Txt v="section" style={{ letterSpacing: -0.8 }}>numa</Txt>
      <ProBadge />
    </View>
  );
}

/** The small mark for the top of a phone screen, so it is always clear which app this is. */
export function MiniWordmark() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }} accessible accessibilityRole="header" accessibilityLabel="Numa Pro">
      <Txt v="section" style={{ letterSpacing: -0.8 }} maxFontSizeMultiplier={1.3}>numa</Txt>
      <ProBadge />
    </View>
  );
}

type ContainerProps = ViewProps & { wide: boolean; bottom: number };

/** Receives TabList's props through asChild, so the triggers stay direct descendants the router can find. */
const NavContainer = forwardRef<RNView, ContainerProps>(function NavContainer({ wide, bottom, style, children, ...props }, ref) {
  const { c } = useTheme();
  if (wide) {
    return (
      <View ref={ref} {...props} style={[style, { width: 240, paddingVertical: space[6], paddingHorizontal: space[4], gap: space[1], borderRightWidth: 1, borderRightColor: c.s2, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }]}>
        {children}
      </View>
    );
  }
  return (
    <View ref={ref} {...props} style={[style, { position: 'absolute', zIndex: 10, elevation: 10, left: space[4], right: space[4] + PLUS + space[3], bottom, height: PLUS, borderRadius: radius.pill, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: c.bg, borderWidth: 1, borderColor: c.s2 }]}>
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
          {wide ? <View style={{ height: space[6] }} /> : null}
          {routes.map((r) => (
            <TabTrigger key={r.name} name={r.name} href={r.href} asChild>
              <NavItem label={r.label} icon={(col) => <r.Icon color={col} size={wide ? 20 : 22} />} wide={wide} />
            </TabTrigger>
          ))}
          {wide ? <SideLink href="/holdings" label="Holdings" icon={(col) => <IconHoldings color={col} />} /> : null}
          {wide ? <SideLink href="/ask" label="Ask or add" icon={(col) => <IconAsk color={col} />} /> : null}
        </NavContainer>
      </TabList>
      <TabSlot style={{ flex: 1, marginRight: wide && panelOpen ? panelWidth(width) : 0 }} />
      {!wide ? (
        <Pressable onPress={() => router.push('/ask')} accessibilityRole="button" accessibilityLabel="Ask or add" style={({ pressed }) => ({ position: 'absolute', zIndex: 10, elevation: 10, right: space[4], bottom, width: PLUS, height: PLUS, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: pressed ? 0.72 : 1 })}>
          <IconPlus color={c.bg} />
        </Pressable>
      ) : null}
    </Tabs>
  );
}
