import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

type Toast = { id: number; text: string; action?: { label: string; onPress: () => void | Promise<void> } };
const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

/** One short message at the bottom, with an optional action such as Undo. It stays 6 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const next = useRef(1);
  const show = useCallback((t: Omit<Toast, 'id'>) => setToast({ ...t, id: next.current++ }), []);
  useEffect(() => {
    if (!toast) return;
    timer.current = setTimeout(() => setToast(null), 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast]);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View key={toast.id} entering={reduce ? undefined : FadeInDown.duration(250)} exiting={reduce ? undefined : FadeOutDown.duration(160)} pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96, alignItems: 'center', zIndex: 50, elevation: 50 }}>
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ maxWidth: 480, width: '100%', minHeight: 52, borderRadius: 16, paddingLeft: 16, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.ink, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
            <Txt v="body" c="bg" style={{ flex: 1 }}>{toast.text}</Txt>
            {toast.action && (
              <Pressable onPress={async () => { const a = toast.action!; setToast(null); await a.onPress(); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
                <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_800ExtraBold' }}>{toast.action.label}</Txt>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
