import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { usePrefs, type ThemeChoice } from '@/state/prefs';
import { palettes, type Palette, type ThemeName } from './tokens';

type ThemeValue = { name: ThemeName; c: Palette; choice: ThemeChoice; setChoice: (c: ThemeChoice) => void };

const ThemeContext = createContext<ThemeValue | null>(null);

/** Follows the saved choice; Auto follows the system. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { theme: choice, set } = usePrefs();
  const name: ThemeName = choice === 'auto' ? (system === 'light' ? 'light' : 'dark') : choice;
  const value = useMemo(() => ({ name, c: palettes[name], choice, setChoice: (next: ThemeChoice) => set('theme', next) }), [name, choice, set]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
