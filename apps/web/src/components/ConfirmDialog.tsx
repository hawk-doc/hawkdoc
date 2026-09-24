import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  /** What will happen — spell out anything that can't be undone */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Yes/no dialog for actions that can't be undone. The repo doesn't use
 * window.confirm; this matches InputDialog.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the confirm button on open and hand focus back on close, so
  // dismissing the dialog doesn't drop the user at the top of the page.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => returnTo?.focus();
  }, []);

  // ARIA marks this modal; it doesn't keep Tab inside it
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
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
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby="confirm-dialog-message"
        className="relative z-10 w-[340px] mx-4 rounded-xl border border-notion-border dark:border-[#3c4043] bg-white dark:bg-[#2d2f31] p-4 shadow-2xl"
      >
        <p className="text-sm font-medium text-notion-text dark:text-[#e8eaed]">{title}</p>
        <p id="confirm-dialog-message" className="mt-1.5 text-[13px] leading-snug text-notion-muted dark:text-[#9aa0a6]">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg text-notion-muted dark:text-[#9aa0a6] hover:bg-notion-hover dark:hover:bg-[#3c4043] hover:text-notion-text dark:hover:text-[#e8eaed] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              destructive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-notion-text text-white hover:bg-opacity-80 dark:bg-[#e8eaed] dark:text-[#202020] dark:hover:bg-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
