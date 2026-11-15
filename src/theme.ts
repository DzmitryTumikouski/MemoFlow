import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Theme = {
  isDark: boolean;
  bg: string;
  card: string;
  text: string;
  muted: string;
  primary: string; // фон кнопок (белый текст сверху)
  link: string; // цвет текстовых кнопок и ссылок
  success: string;
  danger: string;
  border: string;
};

export const lightTheme: Theme = {
  isDark: false,
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#6366f1',
  link: '#4f46e5',
  success: '#10b981',
  danger: '#ef4444',
  border: '#e2e8f0',
};

export const darkTheme: Theme = {
  isDark: true,
  bg: '#0b1120',
  card: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  primary: '#6366f1',
  link: '#a5b4fc',
  success: '#34d399',
  danger: '#f87171',
  border: '#334155',
};

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  theme: Theme;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => {},
  theme: lightTheme,
});

// Считает итоговую тему: «как в системе», светлая или тёмная
export function useResolvedTheme(mode: ThemeMode): Theme {
  const scheme = useColorScheme();
  const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  return isDark ? darkTheme : lightTheme;
}

type ProviderProps = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  theme: Theme;
  children?: React.ReactNode;
};

export function ThemeProvider({ mode, setMode, theme, children }: ProviderProps) {
  const value = useMemo(() => ({ mode, setMode, theme }), [mode, setMode, theme]);
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeMode() {
  const { mode, setMode } = useContext(ThemeContext);
  return { mode, setMode };
}
