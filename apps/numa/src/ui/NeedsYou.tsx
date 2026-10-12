import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import type { Attention } from '@/domain/types';
import { useTheme } from '@/theme/theme';
import { IconCheck } from './icons';
import { useMoney } from './money';
import { Txt } from './Txt';

const dot = { due: 'down', watch: 'warn', housekeeping: 'ink3' } as const;

function Card({ item, index, done, toggle }: { item: Attention; index: number; done: boolean; toggle: () => void }) {
  const { c } = useTheme();
  const { mask } = useMoney();
  const reduce = useReducedMotion();
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(300 + index * 90).duration(500)} style={{ padding: 16, borderRadius: 20, backgroundColor: c.s1, opacity: done ? 0.65 : 1, flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: c[dot[item.urgency]] }} />
      <View style={{ flex: 1 }}>
        <Txt v="cardTitle">{mask(item.title)}</Txt>
        <Txt v="body" c="ink2" style={{ fontSize: 14, marginTop: 4 }}>{mask(item.body)}</Txt>
        {done ? (
          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconCheck color={c.upInk} />
            <Txt v="body" c="upInk" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{item.doneText}</Txt>
            <Pressable onPress={toggle} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 6, minHeight: 30, justifyContent: 'center' }}>
              <Txt v="body" c="ink2" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>Undo</Txt>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 12, flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={toggle} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center' }}>
              <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{item.primary}</Txt>
            </Pressable>
            <Pressable onPress={toggle} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{item.secondary}</Txt>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/** At most three things that need the user, most urgent first, each with one action and Undo. */
export function NeedsYou({ items }: { items: Attention[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const left = items.filter((i) => !done[i.id]).length;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <Txt v="section" accessibilityRole="header">{left === 0 ? 'All clear' : `Needs you · ${left}`}</Txt>
        <Txt v="small" c="ink3">max 3 a day</Txt>
      </View>
      {items.length === 0 && <Txt v="body" c="ink2">Nothing needs you right now.</Txt>}
      <View style={{ gap: 10 }}>
        {items.map((it, i) => (
          <Card key={it.id} item={it} index={i} done={!!done[it.id]} toggle={() => setDone((d) => ({ ...d, [it.id]: !d[it.id] }))} />
        ))}
      </View>
    </View>
  );
}
