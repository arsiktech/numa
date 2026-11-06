import { createContext, useContext, type ReactNode } from 'react';
import { useWriter } from './writes';

const NavigationWriter = createContext<ReturnType<typeof useWriter> | null>(null);

/** Root-owned actions can finish after a route disappears, but never after its account or space changes. */
export function NavigationWriterProvider({ children }: { children: ReactNode }) {
  const write = useWriter();
  return <NavigationWriter.Provider value={write}>{children}</NavigationWriter.Provider>;
}

export function useNavigationWriter() {
  const write = useContext(NavigationWriter);
  if (!write) throw new Error('NavigationWriterProvider is required for navigation-surviving writes');
  return write;
}
