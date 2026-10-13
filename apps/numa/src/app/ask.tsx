import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, Pressable, ScrollView, TextInput, View, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { answer, EXAMPLES } from '@/ask/answer';
import { DraftCard, type DraftStatus } from '@/ask/DraftCard';
import { looksLikeSeveral, parse, type Draft } from '@/ask/parse';
import { proposalToDraft } from '@/ask/proposal';
import { useCloudAskSource, useDemoAskSource, type AskSource } from '@/ask/useAskSource';
import type { AskReply, AskTurn } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { Txt } from '@/ui/Txt';

type Message =
  | { id: number; role: 'you'; text: string }
  | { id: number; role: 'numa'; text: string; pending?: boolean }
  | { id: number; role: 'draft'; draft: Draft; status: DraftStatus; error: string | null; undo?: () => Promise<void> };

export default function AskScreen() {
  const session = useSession();
  return session.kind === 'signedIn' ? <CloudAsk /> : <DemoAsk />;
}
function CloudAsk() { return <AskView source={useCloudAskSource()} />; }
function DemoAsk() { return <AskView source={useDemoAskSource()} />; }

const FAILED: Record<Exclude<AskReply['status'], 'ok'>, string> = {
  unavailable: `I can’t reach Numa’s assistant right now. Adding still works, like “${EXAMPLES[0]}”, and so does “${EXAMPLES[5]}”`,
  busy: 'The assistant is busy. Try again in a minute.',
  limited: `That’s a lot of questions for now. Try again later. Adding still works, like “${EXAMPLES[0]}”.`,
  declined: `I can’t help with that one. Ask about your own money, or add something like “${EXAMPLES[0]}”.`,
};

/** Earlier messages as conversation turns for Claude. Drafts are left out. */
function turns(messages: Message[]): AskTurn[] {
  return messages.flatMap((m): AskTurn[] => (m.role === 'you' ? [{ role: 'user', text: m.text }] : m.role === 'numa' && !m.pending ? [{ role: 'assistant', text: m.text }] : [])).slice(-6);
}

/**
 * How much of the screen the keyboard covers (0 when hidden). On iPhone Ask always reaches the bottom
 * of the screen, as a sheet or full screen, so the composer moves up by exactly this much. Android
 * resizes the window itself and reports 0 here.
 */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const follow = (e: KeyboardEvent, next: number) => {
      if (ios && e.duration) LayoutAnimation.configureNext({ duration: e.duration, update: { duration: e.duration, type: LayoutAnimation.Types[e.easing] ?? 'keyboard' } });
      setHeight(next);
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => follow(e, ios ? e.endCoordinates.height : 0));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => follow(e, 0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

function AskView({ source }: { source: AskSource }) {
  const { c } = useTheme();
  const { mask } = useMoney();
  const insets = useSafeAreaInsets();
  // On iPhone, Ask opens as a sheet that starts below the top of the screen.
  const sheetRef = useRef<View>(null);
  const [sheetTop, setSheetTop] = useState(0);
  const measureSheet = () => {
    if (Platform.OS !== 'ios') return;
    sheetRef.current?.measureInWindow((_x, y) => setSheetTop(Math.max(0, Math.round(y))));
  };
  const keyboard = useKeyboardHeight();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const scroll = useRef<ScrollView>(null);
  const ready = source.status === 'ready';
  const thinking = messages.some((m) => m.role === 'numa' && m.pending);

  const update = (id: number, patch: Partial<Extract<Message, { role: 'draft' }>>) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'draft' ? { ...m, ...patch } : m)));

  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);

  function send(input = text) {
    const value = input.trim();
    if (!value || source.status !== 'ready' || thinking) return;
    const parsed = parse(value, source.ctx);
    const you: Message = { id: nextId.current++, role: 'you', text: value };
    setText('');
    toEnd();
    // The device answers what it can. Claude gets only what it can't: open questions, sentences without a clear amount, and several entries at once.
    if (source.ai && (parsed.type === 'unknown' || (parsed.type === 'question' && parsed.topic === 'help') || (parsed.type === 'draft' && looksLikeSeveral(value)))) {
      const history = turns(messages);
      const pendingId = nextId.current++;
      setMessages((ms) => [...ms, you, { id: pendingId, role: 'numa', text: 'Thinking…', pending: true }]);
      void askClaude(source.ai, value, history, pendingId);
      return;
    }
    const reply: Message = parsed.type === 'draft'
      ? { id: nextId.current++, role: 'draft', draft: parsed.draft, status: 'draft', error: null }
      : { id: nextId.current++, role: 'numa', text: parsed.type === 'question' ? answer(parsed.topic, source.answers) : `I couldn’t find an amount in that. Try “${EXAMPLES[0]}” or ask “${EXAMPLES[5]}”` };
    setMessages((ms) => [...ms, you, reply]);
  }

  async function askClaude(ai: NonNullable<Extract<AskSource, { status: 'ready' }>['ai']>, value: string, history: AskTurn[], pendingId: number) {
    let reply: AskReply;
    try { reply = await ai(value, history); }
    catch { reply = { status: 'unavailable' }; }
    const ctx = source.status === 'ready' ? source.ctx : null;
    const drafts: Message[] = reply.status === 'ok' && ctx
      ? reply.proposals.flatMap((p) => { const d = proposalToDraft(p, ctx); return d ? [{ id: nextId.current++, role: 'draft' as const, draft: d, status: 'draft' as const, error: null }] : []; })
      : [];
    const said = reply.status === 'ok' ? reply.text || (drafts.length ? 'Here’s a draft. Check it and press Save.' : FAILED.unavailable) : FAILED[reply.status];
    setMessages((ms) => [...ms.map((m) => (m.id === pendingId ? { id: pendingId, role: 'numa' as const, text: said } : m)), ...drafts]);
    toEnd();
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
    // On iPhone the sheet starts below the top of the screen, so it needs less top padding.
    <View style={{ flex: 1, backgroundColor: c.bg, paddingBottom: keyboard }}>
      <View ref={sheetRef} onLayout={measureSheet} style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: sheetTop > 0 ? 16 : insets.top + 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 20 }}>
          <Txt v="title" accessibilityRole="header" style={{ flexShrink: 1 }}>Ask or add</Txt>
          <Pressable onPress={close} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Txt v="cardTitle" c="ink2" maxFontSizeMultiplier={1.4}>Close</Txt>
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && (
            <View style={{ gap: 14 }}>
              <Txt v="body" c="ink2">Type what happened or ask about your money. Numa drafts it, and nothing is saved until you press Save.{demo ? ' This is the demo: saving keeps nothing.' : ''}</Txt>
              {source.status === 'ready' && source.ai && <Txt v="small" c="ink3">What your phone can’t answer goes to Claude with a short summary of your numbers. Claude only drafts; you decide what’s saved.</Txt>}
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
            if (m.role === 'numa') return <Txt key={m.id} v="body" c={m.pending ? 'ink3' : undefined} style={{ maxWidth: '92%' }} accessibilityLiveRegion="polite">{mask(m.text)}</Txt>;
            return (
              <DraftCard key={m.id} draft={m.draft} status={m.status} error={m.error} demo={demo}
                onChange={(d) => update(m.id, { draft: d })} onSave={() => save(m)} onDiscard={() => update(m.id, { status: 'discarded' })} onUndo={() => undo(m)} />
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: keyboard > 0 ? 8 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 26, paddingLeft: 18, paddingRight: 6, backgroundColor: c.s1, borderWidth: 1, borderColor: c.line2 }}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={() => send()} returnKeyType="send" autoFocus placeholder={ready ? 'Coffee 4.50, or ask anything' : 'Loading your money…'} editable={ready}
              placeholderTextColor={c.ink3} accessibilityLabel="Ask or add anything" submitBehavior="submit" testID="ask-input"
              style={{ flex: 1, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 16, minHeight: 44, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
            <Pressable onPress={() => send()} disabled={!text.trim() || !ready} accessibilityRole="button" accessibilityLabel="Send" testID="ask-send" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: text.trim() && ready ? 1 : 0.35 }}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" stroke={c.bg} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
