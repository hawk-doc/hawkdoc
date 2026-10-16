/**
 * Every keyboard shortcut the app answers to, named once.
 *
 * A tooltip and the shortcuts reference both read from here, so they cannot
 * drift apart, and the modifier is resolved for the platform rather than
 * written into the label — the toolbar used to promise "⌘B" to every user,
 * which was wrong on Windows and Linux.
 */

/** True on Apple platforms, where the command key stands in for control */
export function isAppleOs(): boolean {
  // userAgentData is the modern source; platform is the fallback, and both
  // can be missing (older browsers, jsdom), where Ctrl is the safer guess.
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = data?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export interface Shortcut {
  /** `event.key`, lowercased for letters */
  key: string;
  /** Needs the command key on Apple platforms, control elsewhere */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** What the shortcut does, for the reference */
  label: string;
}

/**
 * A shortcut's keys as the reader should see them. `mod` becomes ⌘ or Ctrl
 * depending on the platform.
 */
export function keysOf(shortcut: Shortcut, apple = isAppleOs()): string[] {
  const keys: string[] = [];
  if (shortcut.mod) keys.push(apple ? '⌘' : 'Ctrl');
  if (shortcut.shift) keys.push(apple ? '⇧' : 'Shift');
  keys.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return keys;
}

/** A shortcut written out for a `title` attribute, e.g. "Bold (⌘B)" */
export function hintFor(shortcut: Shortcut, apple = isAppleOs()): string {
  const keys = keysOf(shortcut, apple);
  return `${shortcut.label} (${apple ? keys.join('') : keys.join('+')})`;
}

/**
 * Whether a key event is this shortcut.
 *
 * `metaKey` on Apple platforms and `ctrlKey` elsewhere, so Ctrl+B on a Mac —
 * which means something else to the OS — isn't mistaken for it.
 */
export function matches(event: KeyboardEvent, shortcut: Shortcut, apple = isAppleOs()): boolean {
  const mod = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!!shortcut.mod !== mod) return false;
  if (!!shortcut.shift !== event.shiftKey) return false;
  if (!!shortcut.alt !== event.altKey) return false;
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

export const SHORTCUTS = {
  bold: { key: 'b', mod: true, label: 'Bold' },
  italic: { key: 'i', mod: true, label: 'Italic' },
  underline: { key: 'u', mod: true, label: 'Underline' },
  undo: { key: 'z', mod: true, label: 'Undo' },
  redo: { key: 'z', mod: true, shift: true, label: 'Redo' },
  find: { key: 'f', mod: true, label: 'Find and replace' },
  exportPdf: { key: 'p', mod: true, label: 'Export as PDF' },
  focusMode: { key: '.', mod: true, label: 'Focus mode' },
  reference: { key: '/', mod: true, label: 'Keyboard shortcuts' },
} as const satisfies Record<string, Shortcut>;

/** Grouped for the reference dialog, in the order a reader meets them */
export const SHORTCUT_GROUPS: { heading: string; shortcuts: Shortcut[] }[] = [
  {
    heading: 'Formatting',
    shortcuts: [SHORTCUTS.bold, SHORTCUTS.italic, SHORTCUTS.underline],
  },
  {
    heading: 'Editing',
    shortcuts: [SHORTCUTS.undo, SHORTCUTS.redo, SHORTCUTS.find],
  },
  {
    heading: 'Getting around',
    shortcuts: [SHORTCUTS.focusMode, SHORTCUTS.reference],
  },
  {
    heading: 'Exporting',
    shortcuts: [SHORTCUTS.exportPdf],
  },
];

/** Keys that aren't chords, so they have no modifier to resolve */
export const TYPED_HINTS: { keys: string; label: string }[] = [
  { keys: '/', label: 'Open the block menu' },
  { keys: '{{ }}', label: 'Insert a template variable' },
  { keys: 'Esc', label: 'Close a panel, or leave focus mode' },
];
