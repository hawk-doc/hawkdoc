import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';

const originalMatchMedia = window.matchMedia;

/** A controllable prefers-color-scheme media query. */
function mockSystemTheme(initialDark: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return {
    setDark(dark: boolean) {
      mql.matches = dark;
      listeners.forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
  };
}

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('uses the saved theme when there is one', () => {
    mockSystemTheme(false);
    localStorage.setItem('hawkdoc-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows the OS theme, including live changes, when nothing is saved', () => {
    const system = mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => system.setDark(true));
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // Following the OS must not pin the theme in storage
    expect(localStorage.getItem('hawkdoc-theme')).toBeNull();
  });

  it('saves an explicit toggle, which then wins over OS changes', () => {
    const system = mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('hawkdoc-theme')).toBe('dark');

    act(() => system.setDark(false));
    expect(result.current.theme).toBe('dark');
  });

  it('works when storage access throws', () => {
    mockSystemTheme(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('stops listening to the OS on unmount', () => {
    const system = mockSystemTheme(false);
    const { unmount } = renderHook(() => useTheme());
    expect(system.listenerCount()).toBe(1);
    unmount();
    expect(system.listenerCount()).toBe(0);
  });
});
