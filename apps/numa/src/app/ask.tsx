import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { answer, EXAMPLES } from '@/ask/answer';
import { DraftCard, type DraftStatus } from '@/ask/DraftCard';
import { parse, type Draft } from '@/ask/parse';
import { useCloudAskSource, useDemoAskSource, type AskSource } from '@/ask/useAskSource';
import { useSession } from '@/cloud/session';
import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';

type Message =
  | { id: number; role: 'you'; text: string }
  | { id: number; role: 'numa'; text: string }
  | { id: number; role: 'draft'; draft: Draft; status: DraftStatus; error: string | null; undo?: () => Promise<void> };

export default function AskScreen() {
  const session = useSession();
  return session.kind === 'signedIn' ? <CloudAsk /> : <DemoAsk />;
}
function CloudAsk() { return <AskView source={useCloudAskSource()} />; }
function DemoAsk() { return <AskView source={useDemoAskSource()} />; }

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

function AskView({ source }: { source: AskSource }) {
  const { c } = useTheme();
  const { mask } = useMoney();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const scroll = useRef<ScrollView>(null);
  const ready = source.status === 'ready';

  const update = (id: number, patch: Partial<Extract<Message, { role: 'draft' }>>) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'draft' ? { ...m, ...patch } : m)));

  function send(input = text) {
    const value = input.trim();
    if (!value || source.status !== 'ready') return;
    const parsed = parse(value, source.ctx);
    const you: Message = { id: nextId.current++, role: 'you', text: value };
    const reply: Message = parsed.type === 'draft'
      ? { id: nextId.current++, role: 'draft', draft: parsed.draft, status: 'draft', error: null }
      : { id: nextId.current++, role: 'numa', text: parsed.type === 'question' ? answer(parsed.topic, source.answers) : `I couldn’t find an amount in that. Try “${EXAMPLES[0]}” or ask “${EXAMPLES[5]}”` };
    setMessages((ms) => [...ms, you, reply]);
    setText('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }

  async function save(m: Extract<Message, { role: 'draft' }>) {
    if (source.status !== 'ready') return;
    update(m.id, { status: 'saving', error: null });
    try {
      const saved = await source.save(m.draft);
      update(m.id, { status: 'saved', undo: saved.undo });
    } catch (e) {
      const message = e instanceof Error && /exchange rate|price you paid/.test(e.message) ? e.message : 'Couldn’t save that. Check the details and try again.';
      update(m.id, { status: 'draft', error: message });
    }
  }

  async function undo(m: Extract<Message, { role: 'draft' }>) {
    if (!m.undo) return;
    update(m.id, { status: 'undoing', error: null });
    try { await m.undo(); update(m.id, { status: 'undone' }); }
    catch { update(m.id, { status: 'saved', error: 'Couldn’t undo. Try again.' }); }
  }

  const demo = source.status === 'ready' && source.demo;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: insets.top + 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 }}>
          <Txt v="title" accessibilityRole="header">Ask or add</Txt>
          <Pressable onPress={close} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Txt v="cardTitle" c="ink2">Close</Txt>
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && (
            <View style={{ gap: 14 }}>
              <Txt v="body" c="ink2">Type what happened or ask about your money. Numa drafts it, and nothing is saved until you press Save.{demo ? ' This is the demo: saving keeps nothing.' : ''}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {EXAMPLES.map((e) => (
                  <Pressable key={e} onPress={() => send(e)} disabled={!ready} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.line2, justifyContent: 'center' }}>
                    <Txt v="small" style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 14 }}>{e}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {messages.map((m) => {
            if (m.role === 'you') {
              return (
                <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '82%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: c.s2 }}>
                  <Txt v="body">{m.text}</Txt>
                </View>
              );
            }
            if (m.role === 'numa') return <Txt key={m.id} v="body" style={{ maxWidth: '92%' }} accessibilityLiveRegion="polite">{mask(m.text)}</Txt>;
            return (
              <DraftCard key={m.id} draft={m.draft} status={m.status} error={m.error} demo={demo}
                onChange={(d) => update(m.id, { draft: d })} onSave={() => save(m)} onDiscard={() => update(m.id, { status: 'discarded' })} onUndo={() => undo(m)} />
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 26, paddingLeft: 18, paddingRight: 6, backgroundColor: c.s1, borderWidth: 1, borderColor: c.line2 }}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={() => send()} returnKeyType="send" autoFocus placeholder={ready ? 'Coffee 4.50, or ask anything' : 'Loading your money…'} editable={ready}
              placeholderTextColor={c.ink3} accessibilityLabel="Ask or add anything" submitBehavior="submit"
              style={{ flex: 1, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 16, minHeight: 44, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
            <Pressable onPress={() => send()} disabled={!text.trim() || !ready} accessibilityRole="button" accessibilityLabel="Send" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: text.trim() && ready ? 1 : 0.35 }}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" stroke={c.bg} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
