import { webFont } from '@/theme/webFont';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, ScrollView, TextInput, View, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { answer, EXAMPLES } from '@/ask/answer';
import { DraftCard, type DraftStatus } from '@/ask/DraftCard';
import { looksLikeSeveral, parse, type Draft } from '@/ask/parse';
import { proposalToDraft } from '@/ask/proposal';
import { useCloudAskSource, useDemoAskSource, type AskSource } from '@/ask/useAskSource';
import type { AskReply, AskTurn } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { AISharingActions, AISharingPanel } from '@/privacy/AISharingPanel';
import { useTheme } from '@/theme/theme';
import { useMoney } from '@/ui/money';
import { PanelFrame } from '@/ui/Panel';
import { Txt } from '@/ui/Txt';

type ConsentDecision = { question: string; status: 'open' | 'approving' | 'closed' };

type Message =
  | { id: number; role: 'you'; text: string }
  | { id: number; role: 'numa'; text: string; pending?: boolean }
  | { id: number; role: 'draft'; draft: Draft; status: DraftStatus; error: string | null; undo?: () => Promise<void> };

export default function AskScreen() {
  const session = useSession();
  return session.kind === 'signedIn' ? <CloudAsk /> : <DemoAsk />;
}
function CloudAsk() { const source = useCloudAskSource(); return <AskView key={source.status === 'ready' ? source.contextKey : 'loading'} source={source} />; }
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
 *
 * The keyboard can come up before this subscribes (focus while the sheet is still sliding in), so it
 * also reads where the keyboard is now, follows every frame change, and `sync` re-reads it on focus.
 */
function useKeyboardHeight() {
  const ios = Platform.OS === 'ios';
  const covered = (screenY: number) => Math.max(0, Math.round(Dimensions.get('screen').height - screenY));
  const now = () => { const m = ios ? Keyboard.metrics() : undefined; return m && Keyboard.isVisible() ? covered(m.screenY) : 0; };
  const [height, setHeight] = useState(now);
  useEffect(() => {
    if (!ios) return;
    const follow = (e: KeyboardEvent) => {
      const next = covered(e.endCoordinates.screenY);
      if (e.duration) LayoutAnimation.configureNext({ duration: e.duration, update: { duration: e.duration, type: LayoutAnimation.Types[e.easing] ?? 'keyboard' } });
      setHeight(next);
    };
    const subs = (['keyboardWillShow', 'keyboardDidShow', 'keyboardWillChangeFrame', 'keyboardDidChangeFrame'] as const).map((name) => Keyboard.addListener(name, follow));
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    // Catches a keyboard that came up before these listeners existed.
    const first = setTimeout(() => setHeight(now()), 0);
    return () => { clearTimeout(first); subs.forEach((s) => s.remove()); hide.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = () => { if (ios) setTimeout(() => setHeight(now()), 400); };
  return { height, sync };
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
  const { height: keyboard, sync: syncKeyboard } = useKeyboardHeight();
  const [text, setText] = useState('');
  const [consentDecision, setConsentDecision] = useState<ConsentDecision | null>(null);
  const consentQuestion = consentDecision?.question ?? null;
  const currentConsent = useRef<ConsentDecision | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const sendLocked = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => {
    alive.current = false;
    if (currentConsent.current) currentConsent.current.status = 'closed';
    currentConsent.current = null;
  }; }, []);
  useEffect(() => {
    if (consentQuestion === null) return;
    Keyboard.dismiss();
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [consentQuestion]);
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const scroll = useRef<ScrollView>(null);
  const ready = source.status === 'ready';
  const thinking = messages.some((m) => m.role === 'numa' && m.pending);

  const update = (id: number, patch: Partial<Extract<Message, { role: 'draft' }>>) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'draft' ? { ...m, ...patch } : m)));

  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);

  function sendRemote(value: string) {
    if (source.status !== 'ready' || !source.ai || sendLocked.current || !alive.current) return;
    sendLocked.current = true;
    const history = turns(messages);
    const you: Message = { id: nextId.current++, role: 'you', text: value };
    const pendingId = nextId.current++;
    setText(''); setConsentError(null); toEnd();
    setMessages(ms => [...ms, you, { id: pendingId, role: 'numa', text: 'Thinking…', pending: true }]);
    void askClaude(source.ai, value, history, pendingId);
  }

  function send(input = text) {
    const value = input.trim();
    if (!value || source.status !== 'ready' || thinking || sendLocked.current || currentConsent.current !== null) return;
    const parsed = parse(value, source.ctx);
    // Deterministic entries and local answers need no third-party sharing permission.
    if (source.ai && (parsed.type === 'unknown' || (parsed.type === 'question' && parsed.topic === 'help') || (parsed.type === 'draft' && looksLikeSeveral(value)))) {
      const permission = source.sharing?.state;
      if (!permission) { setConsentError('Loading your AI sharing choice. Try again in a moment.'); return; }
      if (!permission.userId || permission.deletionPending) {
        setConsentError(permission.deletionPending ? (permission.deletionStarted ? 'Account deletion has started. New entries and AI replies are unavailable.' : 'AI replies are paused while account deletion is pending. Manual entries still work.') : 'Your account is unavailable. Sign in again before asking AI.'); return;
      }
      if (!permission.allowed) {
        const decision: ConsentDecision = { question: value, status: 'open' };
        currentConsent.current = decision;
        setText(value); setConsentError(null); setConsentDecision(decision); return;
      }
      sendRemote(value); return;
    }
    const you: Message = { id: nextId.current++, role: 'you', text: value };
    setText(''); setConsentError(null); toEnd();
    const reply: Message = parsed.type === 'draft'
      ? { id: nextId.current++, role: 'draft', draft: parsed.draft, status: 'draft', error: null }
      : { id: nextId.current++, role: 'numa', text: parsed.type === 'question' ? answer(parsed.topic, source.answers) : `I couldn’t find an amount in that. Try “${EXAMPLES[0]}” or ask “${EXAMPLES[5]}”` };
    setMessages(ms => [...ms, you, reply]);
  }

  function cancelConsent(decision: ConsentDecision | null) {
    if (!alive.current || !decision || currentConsent.current !== decision || decision.status !== 'open') return;
    // First action wins synchronously, including callbacks queued before the next render.
    decision.status = 'closed'; currentConsent.current = null;
    setConsentDecision(null); setConsentError(null);
  }

  async function allowAndSend(decision: ConsentDecision | null) {
    if (!alive.current || !decision || currentConsent.current !== decision || decision.status !== 'open' || source.status !== 'ready' || !source.sharing) return;
    decision.status = 'approving'; setConsentBusy(true); setConsentError(null);
    try {
      await source.sharing.change(true);
      if (!alive.current || currentConsent.current !== decision || decision.status !== 'approving') return;
      decision.status = 'closed'; currentConsent.current = null;
      setConsentDecision(null); setConsentBusy(false);
      sendRemote(decision.question);
    } catch {
      if (alive.current && currentConsent.current === decision && decision.status === 'approving') {
        decision.status = 'open';
        setConsentError('Couldn’t confirm your sharing choice. Your question wasn’t sent. Try again or choose Not now.');
      }
    } finally {
      if (alive.current && currentConsent.current === decision) setConsentBusy(false);
    }
  }

  async function askClaude(ai: NonNullable<Extract<AskSource, { status: 'ready' }>['ai']>, value: string, history: AskTurn[], pendingId: number) {
    let reply: AskReply;
    try { reply = await ai(value, history, () => alive.current); }
    catch { reply = { status: 'unavailable' }; }
    sendLocked.current = false;
    if (!alive.current) return;
    const ctx = source.status === 'ready' ? source.ctx : null;
    const drafts: Message[] = reply.status === 'ok' && ctx
      ? reply.proposals.flatMap((p) => { const d = proposalToDraft(p, ctx); return d ? [{ id: nextId.current++, role: 'draft' as const, draft: d, status: 'draft' as const, error: null }] : []; })
      : [];
    const permissionFailure = reply.status === 'declined' && reply.reason
      ? reply.reason === 'permission-required' ? 'AI sharing is off or needs a new choice. Review it in Settings, or send your question again to choose.'
        : reply.reason === 'deletion-pending' ? 'AI replies are paused while account deletion is pending.' : 'Your account changed or is unavailable. Open Ask again before continuing.'
      : null;
    const said = reply.status === 'ok' ? reply.text || (drafts.length ? 'Here’s a draft. Check it and press Save.' : FAILED.unavailable) : permissionFailure ?? FAILED[reply.status];
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
    <PanelFrame>
    <View style={{ flex: 1, backgroundColor: c.bg, paddingBottom: keyboard }}>
      <View ref={sheetRef} onLayout={measureSheet} style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: sheetTop > 0 ? 16 : insets.top + 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 20 }}>
          <Txt v="title" accessibilityRole="header" style={{ flexShrink: 1 }}>Ask or add</Txt>
          <Pressable onPress={close} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Txt v="cardTitle" c="ink2" maxFontSizeMultiplier={1.4}>Close</Txt>
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
          {consentQuestion !== null && source.status === 'ready' && source.sharing?.state ? <AISharingPanel showActions={false} disclosure={source.sharing.state.disclosure} allowLabel="Allow and send" busy={consentBusy} error={consentError} onAllow={() => { void allowAndSend(consentDecision); }} onCancel={() => cancelConsent(consentDecision)} /> : <>
          {messages.length === 0 && (
            <View style={{ gap: 14 }}>
              <Txt v="body" c="ink2">Type what happened or ask about your money. Numa drafts it, and nothing is saved until you press Save.{demo ? ' This is the demo: saving keeps nothing.' : ''}</Txt>
              {source.status === 'ready' && source.ai && <Txt v="small" c="ink3">Questions that need Claude require your AI sharing permission first. Manual entries and local answers work without it. You still decide what is saved.</Txt>}
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
          </>}
        </ScrollView>

        {consentQuestion !== null && <View testID="ai-consent-footer" style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line, gap: 8 }}>
          <Txt v="small" c="ink2">Your question hasn’t been sent.</Txt>
          <AISharingActions allowLabel="Allow and send" busy={consentBusy} error={consentError} onAllow={() => { void allowAndSend(consentDecision); }} onCancel={() => cancelConsent(consentDecision)} />
        </View>}

        {consentQuestion === null && <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: keyboard > 0 ? 8 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line }}>
          {consentError ? <Txt v="small" style={{ color: c.down, marginBottom: 8 }} accessibilityRole="alert">{consentError}</Txt> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 26, paddingLeft: 18, paddingRight: 6, backgroundColor: c.s1, borderWidth: 1, borderColor: c.line2 }}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={() => send()} returnKeyType="send" autoFocus onFocus={syncKeyboard} placeholder={ready ? 'Coffee 4.50, or ask anything' : 'Loading your money…'} editable={ready}
              placeholderTextColor={c.ink3} accessibilityLabel="Ask or add anything" submitBehavior="submit" testID="ask-input"
              style={{ flex: 1, color: c.ink, fontFamily: Platform.OS === 'web' ? webFont('Manrope_500Medium') : 'Manrope_500Medium', fontSize: 16, minHeight: 44, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
            <Pressable onPress={() => send()} disabled={!text.trim() || !ready || thinking || consentBusy} accessibilityRole="button" accessibilityLabel="Send" testID="ask-send" style={{ minWidth: 78, height: 44, paddingHorizontal: 12, borderRadius: 22, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: text.trim() && ready ? 1 : 0.35 }}>
              <Txt v="small" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Send</Txt>
              <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" stroke={c.bg} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
            </Pressable>
          </View>
        </View>}
      </View>
    </View>
    </PanelFrame>
  );
}
