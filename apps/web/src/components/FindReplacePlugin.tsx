import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  $createRangeSelection,
  $getNodeByKey,
  $isTextNode,
  $setSelection,
  type EditorState,
  type LexicalEditor,
  type TextNode,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $dfs } from '@lexical/utils';
import { Search, X, ChevronUp, ChevronDown, CaseSensitive } from 'lucide-react';

interface Match {
  nodeKey: string;
  start: number;
  end: number;
  matchIndex: number;
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMatches(
  editorState: EditorState,
  searchTerm: string,
  caseSensitive: boolean,
): Match[] {
  if (!searchTerm) return [];
  const matches: Match[] = [];
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapeRegex(searchTerm), flags);
  let globalIndex = 0;

  editorState.read(() => {
    for (const { node } of $dfs()) {
      if (!$isTextNode(node)) continue;
      const text = node.getTextContent();
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        matches.push({
          nodeKey: node.getKey(),
          start: m.index,
          end: m.index + m[0].length,
          matchIndex: globalIndex++,
        });
      }
    }
  });

  return matches;
}

function navigateToMatch(editor: LexicalEditor, match: Match): void {
  editor.update(() => {
    const node = $getNodeByKey(match.nodeKey);
    if (!node || !$isTextNode(node)) return;
    const sel = $createRangeSelection();
    sel.setTextNodeRange(node as TextNode, match.start, node as TextNode, match.end);
    $setSelection(sel);
  });

  // DOM scroll must happen outside update()
  requestAnimationFrame(() => {
    const domEl = editor.getElementByKey(match.nodeKey);
    domEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function replaceMatch(
  editor: LexicalEditor,
  match: Match,
  replaceTerm: string,
): void {
  editor.update(() => {
    const node = $getNodeByKey(match.nodeKey);
    if (!node || !$isTextNode(node)) return;
    node.spliceText(match.start, match.end - match.start, replaceTerm);
  });
}

function replaceAll(
  editor: LexicalEditor,
  matches: Match[],
  replaceTerm: string,
): void {
  // Reverse order so earlier offsets aren't shifted by later replacements
  const reversed = [...matches].sort((a, b) => b.matchIndex - a.matchIndex);
  editor.update(() => {
    for (const m of reversed) {
      const node = $getNodeByKey(m.nodeKey);
      if (!node || !$isTextNode(node)) continue;
      node.spliceText(m.start, m.end - m.start, replaceTerm);
    }
  });
}

export function FindReplacePlugin(): null | React.ReactElement {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘F / Ctrl+F — open panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => searchInputRef.current?.select(), 0);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Re-collect matches when search params change
  useEffect(() => {
    if (!isOpen || searchTerm === '') {
      setMatches([]);
      setCurrentIndex(0);
      return;
    }
    const found = collectMatches(editor.getEditorState(), searchTerm, caseSensitive);
    setMatches(found);
    setCurrentIndex(0);
  }, [editor, isOpen, searchTerm, caseSensitive]);

  // Re-collect when editor content changes while panel is open
  useEffect(() => {
    if (!isOpen) return;
    return editor.registerUpdateListener(({ editorState }) => {
      if (searchTerm === '') {
        setMatches([]);
        setCurrentIndex(0);
        return;
      }
      const found = collectMatches(editorState, searchTerm, caseSensitive);
      setMatches(found);
      setCurrentIndex((prev) => (found.length === 0 ? 0 : Math.min(prev, found.length - 1)));
    });
  }, [editor, isOpen, searchTerm, caseSensitive]);

  // Navigate to current match
  useEffect(() => {
    if (!isOpen || matches.length === 0) return;
    const match = matches[currentIndex];
    if (match) navigateToMatch(editor, match);
  }, [editor, matches, currentIndex, isOpen]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleReplace = useCallback(() => {
    if (matches.length === 0) return;
    replaceMatch(editor, matches[currentIndex], replaceTerm);
  }, [editor, matches, currentIndex, replaceTerm]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return;
    replaceAll(editor, matches, replaceTerm);
  }, [editor, matches, replaceTerm]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTerm('');
    setReplaceTerm('');
    editor.focus();
  }, [editor]);

  if (!isOpen) return null;

  const noResults = searchTerm !== '' && matches.length === 0;

  return createPortal(
    <div
      className="fixed top-[72px] right-6 z-[90] w-[420px] bg-white dark:bg-[#2d2f31] border border-[#dadce0] dark:border-[#3c4043] rounded-xl shadow-2xl overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Find row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#dadce0] dark:border-[#3c4043]">
        <Search size={14} className="text-[#80868b] dark:text-[#9aa0a6] flex-shrink-0" />

        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          placeholder="Find"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches.length > 0) e.shiftKey ? goPrev() : goNext();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="flex-1 bg-transparent outline-none text-sm text-notion-text dark:text-[#e8eaed] placeholder-notion-muted dark:placeholder-[#5f6368]"
        />

        {/* Match counter */}
        <span
          className={`text-xs tabular-nums flex-shrink-0 min-w-[50px] text-right ${
            noResults
              ? 'text-red-500 dark:text-red-400'
              : 'text-[#80868b] dark:text-[#9aa0a6]'
          }`}
        >
          {searchTerm === ''
            ? ''
            : noResults
            ? 'No results'
            : `${currentIndex + 1} of ${matches.length}`}
        </span>

        {/* Case-sensitive toggle */}
        <button
          type="button"
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
          className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
            caseSensitive
              ? 'bg-[#d3e3fd] text-[#1a73e8] dark:bg-[#1a3a5c] dark:text-[#8ab4f8]'
              : 'text-[#80868b] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]'
          }`}
        >
          <CaseSensitive size={13} />
        </button>

        {/* Prev */}
        <button
          type="button"
          title="Previous match (Shift+Enter)"
          disabled={matches.length === 0}
          onClick={goPrev}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            matches.length === 0
              ? 'text-[#bdc1c6] dark:text-[#5f6368] cursor-not-allowed'
              : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]'
          }`}
        >
          <ChevronUp size={14} />
        </button>

        {/* Next */}
        <button
          type="button"
          title="Next match (Enter)"
          disabled={matches.length === 0}
          onClick={goNext}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            matches.length === 0
              ? 'text-[#bdc1c6] dark:text-[#5f6368] cursor-not-allowed'
              : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]'
          }`}
        >
          <ChevronDown size={14} />
        </button>

        {/* Close */}
        <button
          type="button"
          title="Close (Escape)"
          onClick={close}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors text-[#80868b] dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] hover:bg-[#f1f3f4] dark:hover:bg-[#3c4043]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Spacer — aligns replace input under search input */}
        <div className="w-[14px] flex-shrink-0" />

        <input
          type="text"
          value={replaceTerm}
          placeholder="Replace"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setReplaceTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="flex-1 bg-transparent outline-none text-sm text-notion-text dark:text-[#e8eaed] placeholder-notion-muted dark:placeholder-[#5f6368]"
        />

        <button
          type="button"
          disabled={matches.length === 0}
          onClick={handleReplace}
          className="px-2.5 py-1 text-xs rounded-md transition-colors bg-[#f1f3f4] dark:bg-[#3c4043] text-notion-text dark:text-[#c4c7c5] hover:bg-[#e8eaed] dark:hover:bg-[#4a4d51] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Replace
        </button>

        <button
          type="button"
          disabled={matches.length === 0}
          onClick={handleReplaceAll}
          className="px-2.5 py-1 text-xs rounded-md transition-colors bg-[#f1f3f4] dark:bg-[#3c4043] text-notion-text dark:text-[#c4c7c5] hover:bg-[#e8eaed] dark:hover:bg-[#4a4d51] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Replace All
        </button>
      </div>
    </div>,
    document.body,
  );
}
