import * as Linking from 'expo-linking';
import { Pressable, View } from 'react-native';
import type { AISharingDisclosure } from '@/cloud/api';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';
import { Button } from '@/settings/rows';

type Props = { disclosure: AISharingDisclosure; showActions?: boolean; allowLabel: string; busy: boolean; error?: string | null; onAllow: () => void; onCancel: () => void };
export function AISharingPanel({ disclosure, showActions = true, allowLabel, busy, error, onAllow, onCancel }: Props) {
  const { c } = useTheme();
  return <View testID="ai-sharing-panel" style={{ padding: 18, borderRadius: 18, borderWidth: 1, borderColor: c.line2, backgroundColor: c.s1, gap: 14 }}>
    <Txt v="cardTitle" accessibilityRole="header">Allow AI replies?</Txt>
    <Txt v="body">Some questions need Claude. Before sending anything, choose whether to share your information.</Txt>
    <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{disclosure.recipients}</Txt>
    <Txt v="body" c="ink2">{disclosure.data}</Txt>
    <Txt v="small" c="ink2">{disclosure.purpose}</Txt>
    <Txt v="small" c="ink2">{disclosure.withdrawal}</Txt>
    <Txt v="small" c="ink2">{disclosure.retention}</Txt>
    <Txt v="body">{disclosure.alternative}</Txt>
    {disclosure.links.map(link => <Pressable key={link.url} accessibilityRole="link" onPress={() => { if (link.url.startsWith('https://')) void Linking.openURL(link.url).catch(() => undefined); }} style={{ minHeight: 44, justifyContent: 'center' }}><Txt v="small" style={{ textDecorationLine: 'underline' }}>{link.label}</Txt></Pressable>)}
    {showActions ? <AISharingActions allowLabel={allowLabel} busy={busy} error={error} onAllow={onAllow} onCancel={onCancel} /> : null}
  </View>;
}

/** Can live outside the disclosure scroll area so declining never requires scrolling. */
export function AISharingActions({ allowLabel, busy, error, onAllow, onCancel }: Pick<Props, 'allowLabel' | 'busy' | 'error' | 'onAllow' | 'onCancel'>) {
  const { c } = useTheme();
  return <View style={{ gap: 8 }}>
    {error ? <Txt v="small" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt> : null}
    <Button label={busy ? 'Confirming…' : allowLabel} disabled={busy} onPress={onAllow} />
    <Button label="Not now" quiet disabled={busy} onPress={onCancel} />
  </View>;
}
