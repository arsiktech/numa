import { useMutation, useQuery } from 'convex/react';
import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useTheme } from '@/theme/theme';
import { Seg } from '@/ui/form';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { Action, Button, Section } from './rows';
import { canSendFeedback, FEEDBACK_KINDS, FEEDBACK_MAX, newFeedbackId, type FeedbackKind } from './feedback';

/** Send an idea or a problem to the people who build the app. Plain text, tied to the account, erased with it. */
export function FeedbackSection() {
  const { c } = useTheme();
  const toast = useToast();
  const me = useQuery(cloud.me, {});
  const send = useMutation(cloud.sendFeedback);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // One id per text: a retry of the same words reuses it, so the server keeps one row; any edit is a new request.
  const id = useRef(newFeedbackId());
  const changeKind = (next: FeedbackKind) => { if (next !== kind) { setKind(next); id.current = newFeedbackId(); } };
  const changeMessage = (next: string) => { setMessage(next); id.current = newFeedbackId(); };

  async function submit() {
    if (!me || !canSendFeedback(message) || busy) return;
    setBusy(true);
    try {
      await send({ expectedUserId: me.id, kind, message, platform: Platform.OS, appVersion: Constants.expoConfig?.version ?? '', clientMutationId: id.current });
      toast({ text: 'Thanks. Your feedback was sent.' });
      setOpen(false); setMessage(''); id.current = newFeedbackId();
    } catch (e) {
      toast({ text: e instanceof Error && /TOO_MANY_FEEDBACK|a lot of feedback/.test(e.message) ? 'You’ve sent a lot today. Try again tomorrow.' : 'Couldn’t send. Your text is still here. Try again.' });
    } finally { setBusy(false); }
  }

  return (
    <>
      <Section title="FEEDBACK" />
      {!open && <Action label="Send feedback" detail="Tell us what to build or what broke." onPress={() => setOpen(true)} />}
      {open && (
        <View style={{ marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
          <Seg label="Type of feedback" options={FEEDBACK_KINDS} value={kind} onChange={changeKind} />
          <TextInput value={message} onChangeText={changeMessage} multiline maxLength={FEEDBACK_MAX} accessibilityLabel="Your feedback" placeholder="What should we know?" placeholderTextColor={c.ink3}
            style={{ minHeight: 110, borderRadius: 12, padding: 12, backgroundColor: c.s2, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 15, textAlignVertical: 'top' }} />
          <Txt v="small" c="ink3">Sent with your account and the app version. Don’t include passwords. It’s deleted when you delete your account.</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={busy ? 'Sending…' : 'Send'} onPress={submit} disabled={busy || !me || !canSendFeedback(message)} />
            <Button label="Cancel" quiet onPress={() => setOpen(false)} />
          </View>
        </View>
      )}
    </>
  );
}
