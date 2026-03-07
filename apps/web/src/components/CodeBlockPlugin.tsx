import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CodeNode } from '@lexical/code';
import { Copy, Check } from 'lucide-react';

function CopyButton({ getCode }: { getCode: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(getCode()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors font-mono
        ${copied ? 'text-emerald-400' : 'text-[#565f89] hover:text-[#a9b1d6]'}`}
    >
      {copied ? (
        <><Check size={11} /> Copied!</>
      ) : (
        <><Copy size={11} /> Copy</>
      )}
    </button>
  );
}

function CodeHeader({ codeEl }: { codeEl: HTMLElement }) {
  const lang = codeEl.getAttribute('data-highlight-language') || 'plain';
  const getCode = () => codeEl.textContent ?? '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.4em 0.85em',
        background: '#16161e',
        borderRadius: '8px 8px 0 0',
        borderBottom: '1px solid #2a2b3d',
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#565f89',
        }}
      >
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
