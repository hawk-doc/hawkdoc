import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { isComposingKey } from '../lib/keyboard';

interface InputDialogProps {
  title: string;
  /** A line under the title, where the input needs explaining */
  message?: string;
  placeholder: string;
  defaultValue?: string;
  confirmLabel?: string;
  /**
   * Accept an empty value. Off by default — most callers are asking for
   * something — but a dialog that edits an existing value needs it, or there
   * is no way to clear that value.
   */
  allowEmpty?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** Prompt for a trimmed text value, allowing blank input when requested. */
export function InputDialog({
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Confirm',
  allowEmpty = false,
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Hand focus back on close, so dismissing the dialog doesn't drop the user
  // at the top of the page (matches ConfirmDialog). Declared before the focus
  // effect so it records the opener, not the input.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    return () => returnTo?.focus();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    if (defaultValue) inputRef.current?.select();
  }, [defaultValue]);

  // Keep Tab inside the dialog while it is open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled])',
      );
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
  }, []);

  /** Confirm the trimmed input when it satisfies the empty-value policy. */
  const submit = () => {
    const val = inputRef.current?.value.trim() ?? '';
    if (val || allowEmpty) onConfirm(val);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="relative bg-white dark:bg-[#2d2f31] rounded-xl shadow-2xl border border-notion-border dark:border-[#3c4043] w-80 p-4 z-10"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-notion-text dark:text-[#e8eaed] text-sm">{title}</span>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {message && (
          <p className="mb-3 -mt-1 text-[12px] leading-snug text-notion-muted dark:text-[#9aa0a6]">
            {message}
          </p>
        )}
        <input
          ref={inputRef}
          type="text"
          // The dialog's title is the only name this field has; without it the
          // input is announced as just "edit text"
          aria-label={title}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-white dark:bg-[#202124] text-notion-text dark:text-[#e8eaed] placeholder:text-notion-muted dark:placeholder:text-[#80868b] border border-notion-border dark:border-[#3c4043] rounded-lg outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 mb-3"
          onKeyDown={(e) => {
            if (isComposingKey(e)) return;
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              // Keep the panel underneath (e.g. version history) from also
              // closing on the same press
              e.stopPropagation();
              onCancel();
            }
          }}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] rounded-lg hover:bg-notion-hover dark:hover:bg-[#3c4043] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-3 py-1.5 text-sm bg-notion-text text-white dark:bg-[#e8eaed] dark:text-[#202020] rounded-lg hover:opacity-80 transition-opacity"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
