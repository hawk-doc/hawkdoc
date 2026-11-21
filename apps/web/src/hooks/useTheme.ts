import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'hawkdoc-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Saved choice, or null when none is saved or storage is unavailable (private mode, blocked cookies). */
function readSavedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Light/dark theme. Until the user toggles, it follows the OS setting (including
 * live changes); after a toggle the explicit choice is saved and wins.
 */
export function useTheme() {
  const [explicit, setExplicit] = useState<Theme | null>(readSavedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = explicit ?? system;

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystem(mql.matches ? 'dark' : 'light');
    onChange(); // the OS setting may have changed before this effect ran
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    saveTheme(next);
    setExplicit(next);
  }, [theme]);

  return { theme, toggle };
}
