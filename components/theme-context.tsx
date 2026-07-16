import React, { createContext, useCallback, useContext } from 'react';
import { lightTheme, Theme } from '../lib/theme';

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const toggleTheme = useCallback(() => {
    // Stackr Rev 2 is light-only. Keep the function for older callers without enabling dark mode.
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: lightTheme, isDark: false, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
