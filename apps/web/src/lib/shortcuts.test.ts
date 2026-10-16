import { describe, it, expect } from 'vitest';
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  keysOf,
  hintFor,
  matches,
  type Shortcut,
} from './shortcuts';

const APPLE = true;
const OTHER = false;

/** A key event as the browser would deliver it */
function press(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

describe('shortcut labels', () => {
  it('writes the modifier the platform actually uses', () => {
    expect(keysOf(SHORTCUTS.bold, APPLE)).toEqual(['⌘', 'B']);
    expect(keysOf(SHORTCUTS.bold, OTHER)).toEqual(['Ctrl', 'B']);
  });

  it('joins Apple keys tightly and others with a plus', () => {
    expect(hintFor(SHORTCUTS.bold, APPLE)).toBe('Bold (⌘B)');
    expect(hintFor(SHORTCUTS.bold, OTHER)).toBe('Bold (Ctrl+B)');
  });

  it('spells out shift', () => {
    expect(hintFor(SHORTCUTS.redo, APPLE)).toBe('Redo (⌘⇧Z)');
    expect(hintFor(SHORTCUTS.redo, OTHER)).toBe('Redo (Ctrl+Shift+Z)');
  });

  it('leaves multi-character keys as they are', () => {
    const escape: Shortcut = { key: 'Escape', label: 'Close' };
    expect(keysOf(escape, APPLE)).toEqual(['Escape']);
  });

  it('upper-cases a single letter but not punctuation', () => {
    expect(keysOf(SHORTCUTS.reference, APPLE)).toEqual(['⌘', '/']);
    expect(keysOf(SHORTCUTS.sidebar, APPLE)).toEqual(['⌘', '\\']);
  });
});

describe('matching a key event', () => {
  it('matches command on Apple platforms and control elsewhere', () => {
    expect(matches(press('b', { metaKey: true }), SHORTCUTS.bold, APPLE)).toBe(true);
    expect(matches(press('b', { ctrlKey: true }), SHORTCUTS.bold, OTHER)).toBe(true);
  });

  it('does not take control on a Mac for command', () => {
    // Ctrl+B means something else to macOS; treating it as Bold would steal it
    expect(matches(press('b', { ctrlKey: true }), SHORTCUTS.bold, APPLE)).toBe(false);
    expect(matches(press('b', { metaKey: true }), SHORTCUTS.bold, OTHER)).toBe(false);
  });

  it('needs the modifier', () => {
    expect(matches(press('b'), SHORTCUTS.bold, APPLE)).toBe(false);
  });

  it('tells undo and redo apart by shift', () => {
    const plain = press('z', { metaKey: true });
    const shifted = press('z', { metaKey: true, shiftKey: true });
    expect(matches(plain, SHORTCUTS.undo, APPLE)).toBe(true);
    expect(matches(plain, SHORTCUTS.redo, APPLE)).toBe(false);
    expect(matches(shifted, SHORTCUTS.redo, APPLE)).toBe(true);
    expect(matches(shifted, SHORTCUTS.undo, APPLE)).toBe(false);
  });

  it('ignores the case the browser reports', () => {
    expect(matches(press('B', { metaKey: true }), SHORTCUTS.bold, APPLE)).toBe(true);
  });

  it('matches the punctuation shortcuts', () => {
    expect(matches(press('/', { metaKey: true }), SHORTCUTS.reference, APPLE)).toBe(true);
    expect(matches(press('\\', { metaKey: true }), SHORTCUTS.sidebar, APPLE)).toBe(true);
    expect(matches(press('.', { metaKey: true }), SHORTCUTS.focusMode, APPLE)).toBe(true);
  });
});

describe('the reference', () => {
  it('lists every shortcut exactly once', () => {
    const listed = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);
    const all = Object.values(SHORTCUTS);
    expect(listed).toHaveLength(all.length);
    // A shortcut missing from the groups would exist but never be documented
    for (const shortcut of all) expect(listed).toContain(shortcut);
  });

  it('gives every shortcut a label to show', () => {
    for (const shortcut of Object.values(SHORTCUTS)) {
      expect(shortcut.label.length).toBeGreaterThan(0);
    }
  });
});
