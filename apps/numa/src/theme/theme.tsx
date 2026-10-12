import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { palettes, type Palette, type ThemeName } from './tokens';

type ThemeChoice = ThemeName | 'auto';
type ThemeValue = { name: ThemeName; c: Palette; choice: ThemeChoice; setChoice: (c: ThemeChoice) => void };

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoice] = useState<ThemeChoice>('auto');
  const name: ThemeName = choice === 'auto' ? (system === 'light' ? 'light' : 'dark') : choice;
  const value = useMemo(() => ({ name, c: palettes[name], choice, setChoice }), [name, choice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
