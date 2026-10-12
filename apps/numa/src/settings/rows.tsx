import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';

export function Row({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ minHeight: 60, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1 }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{title}</Txt>
        {detail ? <Txt v="small" c="ink2" style={{ marginTop: 2 }}>{detail}</Txt> : null}
      </View>
      {children}
    </View>
  );
}

export function Action({ label, detail, onPress, danger, disabled }: { label: string; detail?: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" aria-disabled={!!disabled} accessibilityHint={detail}
      style={{ minHeight: 52, paddingVertical: 12, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.line, opacity: disabled ? 0.5 : 1 }}>
      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: danger ? c.down : c.ink }}>{label}</Txt>
      {detail ? <Txt v="small" c="ink2" style={{ marginTop: 2 }}>{detail}</Txt> : null}
    </Pressable>
  );
}

export function Section({ title }: { title: string }) {
  return <Txt v="label" c="ink3" style={{ marginTop: 28 }} accessibilityRole="header">{title}</Txt>;
}

/** A filled button for the one main action on a form. */
export function Button({ label, onPress, disabled, danger, quiet }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; quiet?: boolean }) {
  const { c } = useTheme();
  const bg = quiet ? 'transparent' : danger ? c.down : c.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" aria-disabled={!!disabled}
      style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: quiet ? 1 : 0, borderColor: c.line2, opacity: disabled ? 0.4 : 1 }}>
      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: quiet ? c.ink : danger ? '#FFFFFF' : c.bg }}>{label}</Txt>
    </Pressable>
  );
}
