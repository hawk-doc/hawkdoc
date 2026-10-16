import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ShortcutsDialog } from './ShortcutsDialog';
import { SHORTCUTS, SHORTCUT_GROUPS, TYPED_HINTS } from '../lib/shortcuts';

const realPlatform = navigator.platform;
const setPlatform = (platform: string) => {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
};
afterEach(() => { setPlatform(realPlatform); });

/** The row listing one shortcut, found by its label */
const rowFor = (label: string) => screen.getByText(label).closest('li') as HTMLElement;
const keysIn = (row: HTMLElement) =>
  [...row.querySelectorAll('kbd')].map((key) => key.textContent);

describe('ShortcutsDialog', () => {
  it('lists every shortcut the app answers to', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);

    const rows = screen.getAllByRole('listitem');
    const labels = rows.map((row) => row.firstElementChild?.textContent);
    for (const shortcut of Object.values(SHORTCUTS)) {
      expect(labels).toContain(shortcut.label);
    }
    for (const hint of TYPED_HINTS) {
      expect(screen.getByText(hint.label)).toBeTruthy();
    }
  });

  it('groups them under headings', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    for (const group of SHORTCUT_GROUPS) {
      expect(screen.getByText(group.heading)).toBeTruthy();
    }
    expect(screen.getByText('While typing')).toBeTruthy();
  });

  it('shows the command key on a Mac', () => {
    setPlatform('MacIntel');
    render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(keysIn(rowFor('Bold'))).toEqual(['⌘', 'B']);
    expect(keysIn(rowFor('Redo'))).toEqual(['⌘', '⇧', 'Z']);
  });

  it('shows control everywhere else', () => {
    setPlatform('Win32');
    render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(keysIn(rowFor('Bold'))).toEqual(['Ctrl', 'B']);
    expect(keysIn(rowFor('Redo'))).toEqual(['Ctrl', 'Shift', 'Z']);
  });

  it('is a modal dialog with a name', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('closes on Escape, on the close button and on the backdrop', () => {
    const onClose = vi.fn();
    const { unmount } = render(<ShortcutsDialog onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Close keyboard shortcuts'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(document.querySelector('[aria-hidden="true"]')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('takes focus on open and gives it back on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<ShortcutsDialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Close keyboard shortcuts'));

    unmount();
    // Dismissing must not drop the reader at the top of the page
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps Escape from reaching document listeners until it is unmounted', () => {
    const onClose = vi.fn();
    const earlyCapture = vi.fn();
    const earlyBubble = vi.fn();
    const lateCapture = vi.fn();
    const lateBubble = vi.fn();
    document.addEventListener('keydown', earlyCapture, true);
    document.addEventListener('keydown', earlyBubble);
    const { unmount } = render(<ShortcutsDialog onClose={onClose} />);
    document.addEventListener('keydown', lateCapture, true);
    document.addEventListener('keydown', lateBubble);

    try {
      fireEvent.keyDown(screen.getByLabelText('Close keyboard shortcuts'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      for (const listener of [earlyCapture, earlyBubble, lateCapture, lateBubble]) {
        expect(listener).not.toHaveBeenCalled();
      }

      unmount();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      for (const listener of [earlyCapture, earlyBubble, lateCapture, lateBubble]) {
        expect(listener).toHaveBeenCalledTimes(1);
      }
    } finally {
      unmount();
      document.removeEventListener('keydown', earlyCapture, true);
      document.removeEventListener('keydown', earlyBubble);
      document.removeEventListener('keydown', lateCapture, true);
      document.removeEventListener('keydown', lateBubble);
    }
  });

  it.each([false, true])('traps Tab with shiftKey=%s', (shiftKey) => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    const close = screen.getByLabelText('Close keyboard shortcuts');
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });

    fireEvent(close, event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });
});
