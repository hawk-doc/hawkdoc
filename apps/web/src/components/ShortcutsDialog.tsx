import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { SHORTCUT_GROUPS, TYPED_HINTS, keysOf, isAppleOs } from '../lib/shortcuts';

/** Renders shortcut key labels as individual keyboard key badges. */
function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-shrink-0 items-center gap-1">
      {keys.map((key) => (
        <kbd key={key} className="editor-kbd">{key}</kbd>
      ))}
    </span>
  );
}

/** Renders a shortcut description and its key badges as a reference list item. */
function Row({ label, keys }: { label: string; keys: string[] }) {
  return (
    <li className="flex items-center justify-between gap-4 py-1">
      <span className="text-[13px] text-notion-text dark:text-[#e8eaed]">{label}</span>
      <Keys keys={keys} />
    </li>
  );
}

/**
 * What the keyboard can do, which was otherwise only discoverable by reading
 * the source. Everything here comes from the shortcut registry, so the list
 * cannot fall behind what the app answers to.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const apple = isAppleOs();

  // Focus the close button on open and hand focus back on close, so
  // dismissing doesn't drop the reader at the top of the page.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => returnTo?.focus();
  }, []);

  // Escape closes it, and Tab stays inside it while it covers the page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!items?.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-dialog-title"
        className="relative z-10 mx-4 max-h-[80vh] w-[440px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-notion-border bg-white p-4 shadow-2xl dark:border-[#3c4043] dark:bg-[#2d2f31]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="shortcuts-dialog-title" className="text-sm font-medium text-notion-text dark:text-[#e8eaed]">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="-mr-1 -mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-notion-muted transition-colors hover:bg-notion-hover hover:text-notion-text dark:text-[#9aa0a6] dark:hover:bg-[#3c4043] dark:hover:text-[#e8eaed]"
          >
            <X size={14} />
          </button>
        </div>

        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.heading} className="mt-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-notion-muted dark:text-[#5f6368]">
              {group.heading}
            </h3>
            <ul className="mt-1">
              {group.shortcuts.map((shortcut) => (
                <Row key={shortcut.label} label={shortcut.label} keys={keysOf(shortcut, apple)} />
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-notion-muted dark:text-[#5f6368]">
            While typing
          </h3>
          <ul className="mt-1">
            {TYPED_HINTS.map((hint) => (
              <Row key={hint.label} label={hint.label} keys={[hint.keys]} />
            ))}
          </ul>
        </section>
      </div>
    </div>,
    document.body,
  );
}
