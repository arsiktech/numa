import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';

import { useSession } from '@/cloud/session';

type Root = ComponentType<{ style?: object; children?: ReactNode }>;

/** Signed-out web never loads the gesture library. Demo and signed-in screens do, in a later chunk. */
export function GestureRoot({ children }: { children: ReactNode }) {
  const session = useSession();
  const needs = session.kind === 'signedIn' || session.kind === 'demo';
  const [Handler, setHandler] = useState<Root | null>(null);
  useEffect(() => {
    if (!needs) return;
    let live = true;
    void import('react-native-gesture-handler').then((mod) => { if (live) setHandler(() => mod.GestureHandlerRootView); });
    return () => { live = false; };
  }, [needs]);
  if (!needs || !Handler) return <View style={{ flex: 1 }}>{children}</View>;
  return <Handler style={{ flex: 1 }}>{children}</Handler>;
}
