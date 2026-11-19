import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CodeNode } from '@lexical/code';
import { Copy, Check, X } from 'lucide-react';

const COPY_FEEDBACK_MS = 2000;

type CopyStatus = 'idle' | 'copied' | 'failed';

export function CopyButton({ getCode }: { getCode: () => string }) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Don't update state after the code block (and this button) is removed.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showStatus = (next: CopyStatus) => {
    setStatus(next);
    // Restart the timer so repeated clicks keep the feedback visible for the full duration.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus('idle');
    }, COPY_FEEDBACK_MS);
  };

  const handleCopy = () => {
    // navigator.clipboard is undefined in insecure contexts, and writeText may reject.
    if (!navigator.clipboard) {
      showStatus('failed');
      return;
    }
    navigator.clipboard.writeText(getCode()).then(
      () => showStatus('copied'),
      () => showStatus('failed'),
    );
  };

  const colorClass =
    status === 'copied'
      ? 'text-emerald-400'
      : status === 'failed'
        ? 'text-rose-400'
        : 'text-[#565f89] hover:text-[#a9b1d6]';

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors font-mono ${colorClass}`}
    >
      {status === 'copied' ? (
        <><Check size={11} /> Copied!</>
      ) : status === 'failed' ? (
        <><X size={11} /> Copy failed</>
      ) : (
        <><Copy size={11} /> Copy</>
      )}
    </button>
  );
}

export function CodeHeader({ codeEl }: { codeEl: HTMLElement }) {
  const lang = codeEl.getAttribute('data-highlight-language') || 'plain';
  const getCode = () => codeEl.textContent ?? '';

  return (
    <div
      className="flex items-center justify-between px-[0.85em] py-[0.4em] bg-[#16161e] rounded-t-lg border-b border-[#2a2b3d] font-['JetBrains_Mono','Fira_Code',monospace]"
    >
      <span className="text-[11px] uppercase tracking-[0.08em] text-[#565f89]">
        {lang}
      </span>
      <CopyButton getCode={getCode} />
    </div>
  );
}

export function CodeBlockPlugin() {
  const [editor] = useLexicalComposerContext();
  const [entries, setEntries] = useState<Map<string, { codeEl: HTMLElement; container: HTMLElement }>>(
    new Map(),
  );

  useEffect(() => {
    return editor.registerMutationListener(CodeNode, (mutations) => {
      setEntries((prev) => {
        const next = new Map(prev);

        for (const [key, type] of mutations) {
          if (type === 'destroyed') {
            const entry = next.get(key);
            if (entry) {
              entry.container.remove();
              next.delete(key);
            }
          } else {
            const codeEl = editor.getElementByKey(key) as HTMLElement | null;
            if (!codeEl || next.has(key)) continue;

            const container = document.createElement('div');
            container.setAttribute('data-code-header-for', key);
            codeEl.parentNode?.insertBefore(container, codeEl);
            next.set(key, { codeEl, container });
          }
        }

        return next;
      });
    });
  }, [editor]);

  return (
    <>
      {Array.from(entries.entries()).map(([key, { codeEl, container }]) =>
        createPortal(<CodeHeader codeEl={codeEl} />, container, key),
      )}
    </>
  );
}
