import { usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/cloud/session';
import { useTheme } from '@/theme/theme';
import { WIDE } from '@/ui/Panel';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import {
  FEEDBACK_MOODS,
  FEEDBACK_NOTE_MAX,
  captureFeedbackView,
  fetchFeedbackConfig,
  sendFeedback,
  type FeedbackCapture,
  type FeedbackCaptureConfig,
  type FeedbackMood,
} from './feedback-client';
import { feedbackEndpoint, feedbackFacts, feedbackLocale, shouldCaptureScreenshot, type FeedbackRole } from './gate';

const MOOD_LABEL: Record<FeedbackMood, string> = {
  happy: 'Happy',
  neutral: 'Neutral',
  unhappy: 'Unhappy',
  exclamation: 'Exclamation',
};

function MoodIcon({ mood, color }: { mood: FeedbackMood; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8" {...stroke} />
      {mood === 'exclamation' ? (
        <Path d="M12 8v5M12 16.5v.5" {...stroke} />
      ) : (
        <>
          <Path d="M9 10h.01M15 10h.01" {...stroke} strokeWidth={2.4} />
          {mood === 'happy' && <Path d="M8.5 13.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2" {...stroke} />}
          {mood === 'neutral' && <Path d="M8.5 14.5h7" {...stroke} />}
          {mood === 'unhappy' && <Path d="M8.5 16c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2" {...stroke} />}
        </>
      )}
    </Svg>
  );
}

function NoteIcon({ color }: { color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M6 4h9l4 4v12H6z" {...stroke} />
      <Path d="M14 4v5h5M8.5 13h7M8.5 16.5h4.5" {...stroke} />
    </Svg>
  );
}

/** Icon and “Feedback”, web only. Hidden unless the public env is set and the service has this app on. */
export function FeedbackButton() {
  const endpoint = useMemo(() => feedbackEndpoint(), []);
  const { c, name } = useTheme();
  const toast = useToast();
  const session = useSession();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const buttonRef = useRef<View>(null);
  const noteRef = useRef<TextInput>(null);
  const [config, setConfig] = useState<FeedbackCaptureConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [mood, setMood] = useState<FeedbackMood | null>(null);
  const [shot, setShot] = useState<FeedbackCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const removed = useRef(false);
  const captureJob = useRef<Promise<FeedbackCapture | null> | null>(null);
  const closeRef = useRef<() => void>(() => {});
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!endpoint) return;
    let live = true;
    fetchFeedbackConfig(endpoint).then((next) => { if (live) setConfig(next); });
    return () => { live = false; };
  }, [endpoint]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => {
      const node = buttonRef.current as unknown as { focus?: () => void } | null;
      node?.focus?.();
    });
  }, []);

  const submit = useCallback(async () => {
    if (!endpoint || busy || !note.trim()) return;
    setBusy(true);
    try {
      const pending = removed.current ? null : shot ?? await captureJob.current;
      const locale = feedbackLocale(typeof navigator === 'undefined' ? undefined : navigator.language);
      const role: FeedbackRole = session.kind === 'signedIn' ? 'member' : 'guest';
      const result = await sendFeedback(endpoint, {
        note,
        path: path || '/',
        ...(locale ? { locale } : {}),
        ...(mood ? { mood } : {}),
        ...(pending ? { shot: pending } : {}),
        context: feedbackFacts({ ...(locale ? { locale } : {}), theme: name, role }),
      });
      if (!result.ok) {
        toast({ text: 'Couldn’t send. Try again.' });
        return;
      }
      toast({ text: 'Sent' });
      setNote('');
      setMood(null);
      setShot(null);
      captureJob.current = null;
      close();
    } finally {
      setBusy(false);
    }
  }, [busy, close, endpoint, mood, name, note, path, session.kind, shot, toast]);

  useEffect(() => {
    closeRef.current = close;
    submitRef.current = () => { void submit(); };
  }, [close, submit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => noteRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  if (Platform.OS !== 'web' || !endpoint || !config?.enabled) return null;

  const inChrome = session.kind === 'signedIn' || session.kind === 'demo';
  const bottom = wide || !inChrome ? 18 : Math.max(insets.bottom, 10) + 16 + 62 + 12;

  function toggle() {
    if (open) { close(); return; }
    setOpen(true);
    removed.current = false;
    setShot(null);
    captureJob.current = null;
    if (config && shouldCaptureScreenshot(config, path)) {
      const job = captureFeedbackView();
      captureJob.current = job;
      void job.then((next) => {
        if (captureJob.current === job && !removed.current) setShot(next);
      });
    }
  }

  const self = { dataSet: { fbSelf: true } };
  return (
    <View
      collapsable={false}
      {...self}
      pointerEvents="box-none"
      style={{ position: 'absolute', zIndex: 40, left: wide ? 14 : 16, bottom, width: Math.min(320, Math.max(160, width - 32)) }}
    >
      {open && (
        <>
          <Pressable accessibilityLabel="Close feedback" onPress={close} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as object} />
          <View style={{ position: 'absolute', left: 0, bottom: 52, width: '100%', borderRadius: 18, backgroundColor: c.s1, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } }}>
            <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
              {FEEDBACK_MOODS.map((item) => {
                const on = mood === item;
                return (
                  <Pressable key={item} onPress={() => setMood(on ? null : item)} accessibilityRole="radio" accessibilityLabel={MOOD_LABEL[item]} aria-checked={on}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.s2 : 'transparent', opacity: pressed ? 0.72 : 1 })}>
                    <MoodIcon mood={item} color={on ? c.ink : c.ink3} />
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              ref={noteRef}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={FEEDBACK_NOTE_MAX}
              accessibilityLabel="Feedback"
              placeholderTextColor={c.ink3}
              style={{ minHeight: 96, maxHeight: 180, borderRadius: 12, padding: 12, backgroundColor: c.s2, color: c.ink, fontFamily: 'Manrope_500Medium', fontSize: 15, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              {shot ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Image source={{ uri: shot.dataUrl }} accessibilityLabel="Screenshot" style={{ width: 72, height: 48, borderRadius: 8, backgroundColor: c.s2 }} />
                  <Txt v="small" c="ink2" style={{ flex: 1 }}>Others on the team can see this screenshot.</Txt>
                  <Pressable onPress={() => { removed.current = true; captureJob.current = null; setShot(null); }} accessibilityRole="button" accessibilityLabel="Remove screenshot" style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt v="body" c="ink2">×</Txt>
                  </Pressable>
                </View>
              ) : <View />}
              <Pressable onPress={() => void submit()} disabled={busy || !note.trim()} accessibilityRole="button" accessibilityLabel="Send"
                style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: busy || !note.trim() ? 'transparent' : c.ink, borderWidth: busy || !note.trim() ? 1 : 0, borderColor: c.stroke, opacity: pressed ? 0.72 : 1 })}>
                <Txt v="body" c={busy || !note.trim() ? 'ink3' : 'bg'} style={{ fontFamily: 'Manrope_700Bold' }}>{busy ? 'Sending…' : 'Send'}</Txt>
              </Pressable>
            </View>
          </View>
        </>
      )}
      <Pressable ref={buttonRef} onPress={toggle} accessibilityRole="button" accessibilityLabel="Feedback" aria-expanded={open}
        style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.s1, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.72 : 1 })}>
        <NoteIcon color={c.ink2} />
        <Txt v="small" style={{ fontFamily: 'Manrope_700Bold' }}>Feedback</Txt>
      </Pressable>
    </View>
  );
}
