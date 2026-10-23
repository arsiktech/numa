import { Linking, Pressable, View } from 'react-native';
import { Txt } from '@/ui/Txt';

/** Also covers pre-token Apple accounts and a provider outage. Local deletion never waits. */
export function AppleDeletionHelp() {
  return <View style={{ gap: 8 }}>
    <Txt v="body" c="ink2">If you used Apple, Numa will try to revoke its saved Apple token when deletion starts, not during the 7-day cancellation window. Older accounts may have no saved token. Your Numa data is still deleted if Apple cannot be reached.</Txt>
    <Txt v="small" c="ink2">After deletion starts, you can also revoke access yourself. Revoking Apple access earlier can trigger immediate deletion of the linked Numa account, without the 7-day cancellation window. On iPhone, open Settings, your name, Sign in with Apple, choose Numa, then Stop Using Apple ID. On the web, open account.apple.com, Sign-In and Security, Sign in with Apple, choose Numa and stop using it. Request deletion here first; don’t rely on Apple settings alone.</Txt>
    <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://account.apple.com/').catch(() => undefined); }} style={{ minHeight: 44, justifyContent: 'center' }}><Txt v="body">Open Apple account settings</Txt></Pressable>
  </View>;
}
