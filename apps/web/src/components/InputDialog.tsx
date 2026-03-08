import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface InputDialogProps {
  title: string;
  placeholder: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputDialog({
  title,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    if (defaultValue) inputRef.current?.select();
  }, [defaultValue]);

  const submit = () => {
    const val = inputRef.current?.value.trim() ?? '';
    if (!val) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    onConfirm(val);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-notion-border w-80 p-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-notion-text text-sm">{title}</span>
          <button
            type="button"
            onClick={onCancel}
            className="text-notion-muted hover:text-notion-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 mb-1 transition-colors
            ${error
              ? 'border-red-400 focus:ring-red-500/20 focus:border-red-400'
              : 'border-notion-border focus:ring-violet-500/20 focus:border-violet-400'
            }`}
          onChange={() => { if (error) setError(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <p className={`text-xs text-red-500 mb-2 transition-opacity ${error ? 'opacity-100' : 'opacity-0'}`}>
          This field is required.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-notion-muted hover:text-notion-text rounded-lg hover:bg-notion-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-3 py-1.5 text-sm bg-notion-text text-white rounded-lg hover:opacity-80 transition-opacity"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
