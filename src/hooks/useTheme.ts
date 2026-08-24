import { useCallback, useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'theme';

function readInitialDark(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Tema claro/oscuro: clase `dark` en <html> + localStorage.
 * Consume tokens E0.1 vía `.dark` en tokens.css.
 */
export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState(readInitialDark);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  return { isDarkMode, setIsDarkMode, toggleDarkMode } as const;
}
