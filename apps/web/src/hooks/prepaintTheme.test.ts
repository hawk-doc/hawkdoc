import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DARK_QUERY, THEME_STORAGE_KEY } from './useTheme';

// The inline script in index.html applies the theme before React loads.
// These tests run it as-is and check that it agrees with useTheme.
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

const originalMatchMedia = window.matchMedia;

function setSystemDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === DARK_QUERY && dark,
    media: query,
  })) as unknown as typeof window.matchMedia;
}

function runPrepaint() {
  new Function(inlineScript)();
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('index.html pre-paint theme script', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('exists and uses the same storage key and media query as useTheme', () => {
    expect(inlineScript).not.toBe('');
    expect(inlineScript).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(inlineScript).toContain(`'${DARK_QUERY}'`);
  });

  it('follows the OS setting when nothing is saved', () => {
    setSystemDark(true);
    runPrepaint();
    expect(isDark()).toBe(true);

    setSystemDark(false);
    runPrepaint();
    expect(isDark()).toBe(false);
  });

  it('lets a saved choice override the OS setting', () => {
    setSystemDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runPrepaint();
    expect(isDark()).toBe(true);

    setSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runPrepaint();
    expect(isDark()).toBe(false);
  });

  it('ignores an invalid saved value', () => {
    setSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    runPrepaint();
    expect(isDark()).toBe(true);
  });

  it('falls back to the OS setting when storage throws', () => {
    setSystemDark(true);
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      runPrepaint();
    } finally {
      Storage.prototype.getItem = getItem;
    }
    expect(isDark()).toBe(true);
  });
});
