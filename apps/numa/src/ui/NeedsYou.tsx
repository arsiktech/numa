import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import type { Attention } from '@/domain/types';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { IconCheck } from './icons';
import { useMoney } from './money';
import { Txt } from './Txt';

const dot = { due: 'down', watch: 'warn', housekeeping: 'ink3' } as const;

function Card({ item, index, done, readOnly, onPrimary, onLater, onUndo }: { item: Attention; index: number; done: boolean; readOnly: boolean; onPrimary: () => void; onLater: () => void; onUndo: () => void }) {
  const { c } = useTheme();
  const { mask } = useMoney();
  const reduce = useReducedMotion();
  const action = (label: string, onPress: () => void, filled: boolean) => (
    <Pressable
      onPress={readOnly ? undefined : onPress}
      disabled={readOnly}
      accessibilityRole="button"
      accessibilityState={{ disabled: readOnly }}
      aria-disabled={readOnly}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: filled ? 16 : 12, borderRadius: filled ? 999 : 0, backgroundColor: filled ? (readOnly ? c.s2 : c.ink) : 'transparent', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
    >
      <Txt v="body" c={filled ? (readOnly ? 'ink2' : 'bg') : readOnly ? 'ink3' : 'ink'} style={{ fontFamily: 'Manrope_700Bold' }}>{label}</Txt>
    </Pressable>
  );
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(300 + index * 90).duration(500)} style={{ padding: 16, borderRadius: 20, backgroundColor: c.s1, opacity: done ? 0.65 : 1, flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: c[dot[item.urgency]] }} />
      <View style={{ flex: 1 }}>
        <Txt fbPrivate v="cardTitle">{mask(item.title)}</Txt>
        <Txt fbPrivate v="body" c="ink2" style={{ marginTop: 4 }}>{mask(item.body)}</Txt>
        {done ? (
          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconCheck color={c.upInk} />
            <Txt v="body" c="upInk" style={{ fontFamily: 'Manrope_700Bold' }}>{item.doneText}</Txt>
            <Pressable onPress={onUndo} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 6, minHeight: 30, justifyContent: 'center' }}>
              <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>Undo</Txt>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 12, flexDirection: 'row', gap: 4 }}>
            {action(item.primary, onPrimary, true)}
            {action(item.secondary, onLater, false)}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * At most three things that need the user, most urgent first. "Got it" hides an item until
 * it changes and "Later" brings it back tomorrow; both are remembered on this device and
 * both offer Undo while the card is on screen.
 * In the demo the words stay and the buttons do not run. The sample cannot finish them.
 */
export function NeedsYou({ items, readOnly = false }: { items: Attention[]; readOnly?: boolean }) {
  const { dismiss } = usePrefs();
  // Cards acted on in this view stay visible in their done state so Undo is reachable,
  // even though the parent has already filtered them out.
  const [acted, setActed] = useState<Record<string, { item: Attention; text: string }>>({});
  const shown = [...items.filter((i) => !acted[i.id]), ...Object.values(acted).map((a) => a.item)];
  const left = shown.filter((i) => !acted[i.id]).length;
  const act = (item: Attention, later: boolean) => {
    dismiss(item.id, { title: item.title, later });
    setActed((a) => ({ ...a, [item.id]: { item, text: later ? 'Back tomorrow.' : 'Hidden until it changes.' } }));
  };
  const undo = (item: Attention) => {
    dismiss(item.id, null);
    setActed((a) => { const next = { ...a }; delete next[item.id]; return next; });
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12, marginBottom: 10 }}>
        <Txt v="section" accessibilityRole="header">{left === 0 ? 'All clear' : `Needs you · ${left}`}</Txt>
        <Txt v="small" c="ink3">max 3 a day</Txt>
      </View>
      {shown.length === 0 && <Txt v="body" c="ink2">Nothing needs you right now.</Txt>}
      <View style={{ gap: 10 }}>
        {shown.map((it, i) => (
          <Card key={it.id} item={acted[it.id] ? { ...it, doneText: acted[it.id].text } : it} index={i} done={!!acted[it.id]} readOnly={readOnly} onPrimary={() => act(it, false)} onLater={() => act(it, true)} onUndo={() => undo(it)} />
        ))}
      </View>
    </View>
  );
}
