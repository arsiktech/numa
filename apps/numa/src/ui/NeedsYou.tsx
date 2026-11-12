import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import type { Attention } from '@/domain/types';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { radius, space, type HomeColor } from '@/theme/tokens';
import { IconCheck } from './icons';
import { useMoney } from './money';
import { Txt } from './Txt';

// Only what is due takes the alert colour; a watch is ink and housekeeping is quiet.
const dot = { due: 'down', watch: 'ink', housekeeping: 'ink2' } as const satisfies Record<Attention['urgency'], HomeColor>;

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
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: filled ? space[4] : space[3], borderRadius: filled ? radius.pill : 0, backgroundColor: filled ? (readOnly ? c.bg : c.ink) : 'transparent', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
    >
      <Txt v="body" c={filled ? (readOnly ? 'ink2' : 'bg') : readOnly ? 'ink2' : 'ink'} style={{ fontFamily: 'Manrope_700Bold' }}>{label}</Txt>
    </Pressable>
  );
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(300 + index * 90).duration(500)} style={{ flexGrow: 1, flexBasis: 280, maxWidth: 560, padding: space[4], borderRadius: radius.card, backgroundColor: c.s2, opacity: done ? 0.65 : 1, flexDirection: 'row', gap: space[3] }}>
      <View style={{ width: space[2], height: space[2], marginTop: space[2], borderRadius: space[1], backgroundColor: c[dot[item.urgency]] }} />
      <View style={{ flex: 1 }}>
        <Txt v="cardTitle">{mask(item.title)}</Txt>
        <Txt v="body" c="ink2" style={{ marginTop: space[1] }}>{mask(item.body)}</Txt>
        {done ? (
          <View style={{ marginTop: space[2], flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <IconCheck color={c.ink} />
            <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{item.doneText}</Txt>
            <Pressable onPress={onUndo} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: space[2], minHeight: 32, justifyContent: 'center' }}>
              <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold' }}>Undo</Txt>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: space[3], flexDirection: 'row', gap: space[1] }}>
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
  const { c } = useTheme();
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
  if (shown.length === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }} accessible accessibilityRole="text">
        <IconCheck color={c.ink2} />
        <Txt v="body" c="ink2"><Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>All clear.</Txt> Nothing needs you right now.</Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: space[3] }}>
      <Txt v="section" accessibilityRole="header">{left === 0 ? 'All clear' : `Needs you · ${left}`}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {shown.map((it, i) => (
          <Card key={it.id} item={acted[it.id] ? { ...it, doneText: acted[it.id].text } : it} index={i} done={!!acted[it.id]} readOnly={readOnly} onPrimary={() => act(it, false)} onLater={() => act(it, true)} onUndo={() => undo(it)} />
        ))}
      </View>
    </View>
  );
}
