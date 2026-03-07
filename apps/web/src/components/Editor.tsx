import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type EditorState,
  type LexicalEditor,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TRANSFORMERS } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';

import { EditorToolbar } from './EditorToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { BubbleMenu } from './BubbleMenu';
import { CodeBlockPlugin } from './CodeBlockPlugin';
import { TemplateVariableNode, $createTemplateVariableNode } from '../nodes/TemplateVariableNode';
import { useAutoSave, loadAutoSave } from '../hooks/useAutoSave';

const TEMPLATE_VAR_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/;

interface SlashMenuState {
  query: string;
  anchorRect: DOMRect;
}

function SlashAndVariablePlugin({
  onSlashMenu,
}: {
  onSlashMenu: (state: SlashMenuState | null) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          onSlashMenu(null);
          return;
        }

        const anchor = selection.anchor;
        const node = anchor.getNode();
        const text = node.getTextContent();
        const offset = anchor.offset;
        const textBefore = text.slice(0, offset);

        const varMatch = textBefore.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)$/);
        if (!varMatch && TEMPLATE_VAR_REGEX.test(textBefore)) {
          const fullMatch = textBefore.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/);
          if (fullMatch) {
            const varName = fullMatch[1];
            editor.update(() => {
              const sel = $getSelection();
              if (!$isRangeSelection(sel)) return;
              const anchorNode = sel.anchor.getNode();
              if (!$isTextNode(anchorNode)) return;
              const nodeText = anchorNode.getTextContent();
              const matchIndex = nodeText.lastIndexOf(`{{${varName}}}`);
              if (matchIndex !== -1) {
                anchorNode.spliceText(matchIndex, varName.length + 4, '');
                const varNode = $createTemplateVariableNode(varName);
                sel.insertNodes([varNode]);
              }
            });
            return;
          }
        }

        const slashIndex = textBefore.lastIndexOf('/');
        if (slashIndex !== -1) {
          const query = textBefore.slice(slashIndex + 1);
          const charBeforeSlash = slashIndex > 0 ? textBefore[slashIndex - 1] : '\n';
          if (!charBeforeSlash || charBeforeSlash === '\n' || charBeforeSlash === ' ') {
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
              const range = domSelection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              if (rect.width > 0 || rect.height > 0) {
                onSlashMenu({ query, anchorRect: rect });
                return;
              }
            }
          }
        }

        onSlashMenu(null);
      });
    });
  }, [editor, onSlashMenu]);

  return null;
}

function EditorRefPlugin({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => { onEditor(editor); }, [editor, onEditor]);
  return null;
}

function RestorePlugin({ initialContent }: { initialContent: string | null }) {
  const [editor] = useLexicalComposerContext();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current || !initialContent) return;
    restored.current = true;
    try {
      editor.setEditorState(editor.parseEditorState(initialContent));
    } catch {
      // Invalid saved state — start fresh
    }
  }, [editor, initialContent]);

  return null;
}

interface EditorProps {
  title: string;
  onTitleChange: (title: string) => void;
}

export function Editor({ title, onTitleChange }: EditorProps) {
  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const [initialContent] = useState<string | null>(() => loadAutoSave()?.content ?? null);

  const isSaving = useAutoSave(editorState, title);

  // Word count
  const wordCount = useMemo(() => {
    if (!editorState) return 0;
    let text = '';
    editorState.read(() => { text = $getRoot().getTextContent(); });
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [editorState]);

  // PDF export via Web Worker
  const handleExportPDF = useCallback(() => {
    if (!editorState || isExporting) return;
    setIsExporting(true);

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/pdfExport.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }

    const worker = workerRef.current;
    worker.onmessage = (event: MessageEvent<{ type: string; blobUrl?: string; error?: string }>) => {
      setIsExporting(false);
      if (event.data.type === 'success' && event.data.blobUrl) {
        const a = document.createElement('a');
        a.href = event.data.blobUrl;
        a.download = `${title || 'document'}.pdf`;
        a.click();
        URL.revokeObjectURL(event.data.blobUrl);
      }
    };

    worker.postMessage({
      type: 'export',
      editorStateJSON: JSON.stringify(editorState.toJSON()),
      title,
      watermark: 'HawkDoc',
    });
  }, [editorState, title, isExporting]);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  const initialConfig = {
    namespace: 'HawkDoc',
    theme: {
      root: 'editor-content',
      text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'line-through',
        code: 'editor-inline-code',
      },
      heading: {
        h1: 'editor-h1',
        h2: 'editor-h2',
        h3: 'editor-h3',
      },
      list: {
        ul: 'editor-ul',
        ol: 'editor-ol',
        listitem: 'editor-li',
      },
      quote: 'editor-quote',
      code: 'editor-code',
      link: 'editor-link',
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      AutoLinkNode,
      HorizontalRuleNode,
      TemplateVariableNode,
    ],
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Toolbar — sticky just below the app header ── */}
      {editorInstance && (
        <EditorToolbar
          editor={editorInstance}
          onExportPDF={handleExportPDF}
          isSaving={isSaving || isExporting}
          title={title}
        />
      )}

      {/* ── Centered paper card ── */}
      <div className="flex-1 py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          {/* White paper */}
          <div className="bg-white rounded-xl border border-notion-border shadow-sm px-12 py-12">
            {/* Document title */}
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled"
              className="w-full text-[40px] font-bold text-notion-text placeholder-notion-muted
                         border-none outline-none bg-transparent mb-8 leading-tight tracking-tight"
            />

            {/* Lexical editor */}
            <LexicalComposer initialConfig={initialConfig}>
              <div className="relative">
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      className="editor-content focus:outline-none"
                      aria-label="Document editor"
                    />
                  }
                  placeholder={
                    <div className="editor-placeholder">
                      Press <kbd className="editor-kbd">/</kbd> for commands, or start typing…
                    </div>
                  }
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <AutoFocusPlugin />
                <ListPlugin />
                <LinkPlugin />
                <HorizontalRulePlugin />
                <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                <OnChangePlugin onChange={(state) => setEditorState(state)} />
                <SlashAndVariablePlugin onSlashMenu={setSlashMenu} />
                <EditorRefPlugin onEditor={setEditorInstance} />
                <RestorePlugin initialContent={initialContent} />
                <CodeBlockPlugin />
              </div>

              {slashMenu && editorInstance && (
                <SlashCommandMenu
                  editor={editorInstance}
                  query={slashMenu.query}
                  anchorRect={slashMenu.anchorRect}
                  onClose={() => setSlashMenu(null)}
                />
              )}
            </LexicalComposer>
          </div>

          {/* Footer — below the card */}
          <div className="mt-4 px-1 flex items-center justify-between">
            <span className="text-xs text-notion-muted">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            <span className="text-xs text-notion-muted">
              Press <kbd className="editor-kbd">/</kbd> for commands &nbsp;·&nbsp; <kbd className="editor-kbd">{'{{ }}'}</kbd> for template variables
            </span>
          </div>
        </div>
      </div>

      {/* Floating bubble menu */}
      {editorInstance && <BubbleMenu editor={editorInstance} />}
    </div>
  );
}
