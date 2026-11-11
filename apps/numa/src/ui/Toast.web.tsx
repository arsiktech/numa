import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

type Toast = { id: number; text: string; action?: { label: string; onPress: () => void | Promise<void> } };
const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

/** Web toast. A short fade in CSS, with no animation library on the signed-out path. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
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
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96, alignItems: 'center', zIndex: 50, ...(reduce ? {} : { animationDuration: '200ms', animationName: 'numa-fade', animationTimingFunction: 'cubic-bezier(.22,1,.36,1)' } as object) }}>
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ maxWidth: 480, width: '100%', minHeight: 48, borderRadius: 18, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.ink }}>
            <Txt v="body" c="bg" style={{ flex: 1 }}>{toast.text}</Txt>
            {toast.action && (
              <Pressable onPress={async () => { const a = toast.action!; setToast(null); await a.onPress(); }} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}>
                <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_800ExtraBold' }}>{toast.action.label}</Txt>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
