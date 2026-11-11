import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export function GestureRoot({ children }: { children: ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}
