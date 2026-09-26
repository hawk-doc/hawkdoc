import { useCallback, useEffect, useMemo, useRef, useState, Fragment, lazy, Suspense } from 'react';
import { Minimize2 } from 'lucide-react';
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
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { BubbleMenu } from './BubbleMenu';
import { CodeBlockPlugin } from './CodeBlockPlugin';
import type { CollabStatus } from './CollaborationPlugin';
import { $createTemplateVariableNode } from '../nodes/TemplateVariableNode';
import { TablePlugin } from './TablePlugin';
import { FindReplacePlugin } from './FindReplacePlugin';
import { DraggableBlockPlugin } from './DraggableBlockPlugin';
import { useAutoSave, loadDocContent } from '../hooks/useAutoSave';
import { exportPdf } from '../lib/pdfExport';
import { exportDocx } from '../lib/docxExport';
import { importDocx } from '../lib/docxImport';
import { TEMPLATE_VAR_REGEX, EDITOR_THEME, EDITOR_NODES, MAX_TITLE_LENGTH } from '../constants/editor';
import type { SlashMenuState } from '../interfaces';

// ─── Slash + template-variable detection plugin ───────────────────────────────

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

// ─── Collaboration (lazy) ─────────────────────────────────────────────────────
// Yjs and the Hocuspocus provider are only needed by signed-in users, so they
// load when a collaborative document is first opened.
const CollaborationPlugin = lazy(() =>
  import('./CollaborationPlugin').then((m) => ({ default: m.CollaborationPlugin })),
);

// Keeps the editor read-only while the collaboration code loads. Until the
// plugin binds the editor to Yjs, anything typed has no Yjs counterpart and
// would never be synced or saved.
function ReadOnlyUntilCollabLoads() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(false);
    return () => editor.setEditable(true);
  }, [editor]);
  return null;
}

// ─── Utility plugins ──────────────────────────────────────────────────────────
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

// ─── Main Editor component ────────────────────────────────────────────────────
interface EditorProps {
  docId: string;
  title: string;
  onTitleChange: (title: string) => void;
  // Collaboration props (undefined = local-only mode)
  collabToken?: string;
  collabUser?: { id: string; name: string };
}

export function Editor({ docId, title, onTitleChange, collabToken, collabUser }: EditorProps) {
  const isCollab = !!(collabToken && collabUser);

  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const closeSlashMenu = useCallback(() => setSlashMenu(null), []);
  const [isExporting, setIsExporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [collabStatus, setCollabStatus] = useState<CollabStatus>('connecting');
  const [anchorElem, setAnchorElem] = useState<HTMLElement | null>(null);
  const onPaperRef = useCallback((el: HTMLDivElement | null) => { setAnchorElem(el); }, []);

  useEffect(() => {
    if (!focusMode) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusMode(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focusMode]);

  const [initialContent] = useState<string | null>(() =>
    isCollab ? null : (loadDocContent(docId)?.content ?? null),
  );

  // Disable local autosave in collab mode — Hocuspocus handles server-side persistence
  const isSaving = useAutoSave(isCollab ? null : editorState, title, docId);

  const wordCount = useMemo(() => {
    if (!editorState) return 0;
    let text = '';
    editorState.read(() => { text = $getRoot().getTextContent(); });
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [editorState]);

  const readingTime = useMemo(() => {
    if (wordCount === 0) return null;
    const minutes = wordCount / 200;
    return minutes < 1 ? '< 1 min read' : `${Math.ceil(minutes)} min read`;
  }, [wordCount]);

  const handleExportPDF = useCallback(async () => {
    if (!editorState || isExporting) return;
    setIsExporting(true);
    try {
      await exportPdf(editorState, title);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [editorState, title, isExporting]);

  const handleExportDOCX = useCallback(async () => {
    if (!editorState || isExporting) return;
    setIsExporting(true);
    try {
      await exportDocx(editorState, title);
    } catch (err) {
      console.error('DOCX export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [editorState, title, isExporting]);

  const handleImportDOCX = useCallback(async (file: File) => {
    if (!editorInstance) return;
    setImportError(null);
    setIsExporting(true);
    try {
      await importDocx(editorInstance, file);
    } catch (err) {
      // Import replaces the document, so a failure has to be visible
      setImportError(err instanceof Error ? err.message : 'Could not import that document.');
    } finally {
      setIsExporting(false);
    }
  }, [editorInstance]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        void handleExportPDF();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleExportPDF]);

  const initialConfig = {
    namespace: 'HawkDoc',
    theme: EDITOR_THEME,
    nodes: EDITOR_NODES,
    // In collab mode the document must come from Yjs. Without `null`, Lexical
    // creates its own starting paragraph that Yjs never learns about, and
    // everything typed into it is silently dropped instead of synced.
    editorState: isCollab ? null : undefined,
    onError: (error: Error) => { console.error('Lexical error:', error); },
  };

  return (
    <Fragment>
    <div className="flex flex-col min-h-full">

      {/* Toolbar — hidden in focus mode */}
      {editorInstance && !focusMode && (
        <EditorToolbar
          editor={editorInstance}
          onExportPDF={handleExportPDF}
          onExportDOCX={handleExportDOCX}
          onImportDOCX={(file) => { void handleImportDOCX(file); }}
          isSaving={isSaving || isExporting}
          title={title}
          onToggleFocusMode={() => setFocusMode(true)}
          collabStatus={isCollab ? collabStatus : undefined}
        />
      )}

      {importError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-900"
        >
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Gray canvas — fixed full-screen overlay in focus mode */}
      <div className={`py-4 sm:py-10 transition-colors duration-300 ${focusMode ? 'fixed inset-0 z-[100] overflow-y-auto bg-[#0d0d0d]' : 'flex-1 overflow-x-auto bg-[#e8eaed] dark:bg-[#141414]'}`}>

        {/* Centered A4 paper — full width below the A4 breakpoint so narrow
            screens scroll vertically instead of sideways */}
        <div className="w-full max-w-[794px] mx-auto px-3 sm:px-6 lg:px-0">

          {/* White paper */}
          <div ref={onPaperRef} className="relative bg-white dark:bg-[#1e1e1e] p-6 sm:p-10 lg:p-[72px] min-h-[60vh] lg:min-h-[1123px] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.10)]">
            {/* Document title */}
            <textarea
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled"
              rows={1}
              // The API rejects titles longer than this; stop them here rather
              // than letting the save fail with a 400 the user never sees.
              maxLength={MAX_TITLE_LENGTH}
              className="w-full text-[28px] sm:text-[34px] lg:text-[40px] font-bold text-notion-text dark:text-[#e8eaed] placeholder-notion-muted dark:placeholder-[#5f6368]
                         border-none outline-none bg-transparent mb-8 leading-tight tracking-tight
                         resize-none overflow-hidden block"
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }}
            />

            {/* Lexical editor */}
              <LexicalComposer initialConfig={initialConfig}>
                <div className="relative">
                  <RichTextPlugin
                    contentEditable={
                      <ContentEditable
                        className="editor-content focus:outline-none"
                        ariaLabel="Document editor"
                      />
                    }
                    placeholder={
                      <div className="editor-placeholder">
                        Press <kbd className="editor-kbd">/</kbd> for commands, or start typing…
                      </div>
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                  />

                  {/* History: Lexical's own in local mode; Yjs UndoManager in collab mode */}
                  {!isCollab && <HistoryPlugin />}

                  <AutoFocusPlugin />
                  <ListPlugin />
                  <LinkPlugin />
                  <HorizontalRulePlugin />
                  <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                  <OnChangePlugin onChange={(state) => setEditorState(state)} />
                  <SlashAndVariablePlugin onSlashMenu={setSlashMenu} />
                  <EditorRefPlugin onEditor={setEditorInstance} />
                  <CodeBlockPlugin />
                  <TablePlugin />
                  <FindReplacePlugin />
                  {anchorElem && <DraggableBlockPlugin anchorElem={anchorElem} />}

                  {/* Restore from localStorage only in local mode */}
                  {!isCollab && <RestorePlugin initialContent={initialContent} />}

                  {/* Real-time collaboration — Yjs ↔ Hocuspocus ↔ Lexical */}
                  {isCollab && collabToken && collabUser && (
                    <Suspense fallback={<ReadOnlyUntilCollabLoads />}>
                      <CollaborationPlugin
                        docId={docId}
                        token={collabToken}
                        username={collabUser.name}
                        userId={collabUser.id}
                        onStatus={setCollabStatus}
                      />
                    </Suspense>
                  )}
                </div>

                {slashMenu && editorInstance && (
                  <SlashCommandMenu
                    editor={editorInstance}
                    query={slashMenu.query}
                    anchorRect={slashMenu.anchorRect}
                    onClose={closeSlashMenu}
                  />
                )}
              </LexicalComposer>
          </div>

          {/* Status bar */}
          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-xs text-[#80868b] dark:text-[#5f6368]">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
              {readingTime && <> · {readingTime}</>}
            </span>
            <span className="hidden sm:inline text-xs text-[#80868b] dark:text-[#5f6368]">
              Press <kbd className="editor-kbd">/</kbd> for commands
              &nbsp;·&nbsp;
              <kbd className="editor-kbd">{'{{ }}'}</kbd> for template variables
            </span>
          </div>

        </div>
      </div>

      {/* Floating bubble menu */}
      {editorInstance && <BubbleMenu editor={editorInstance} />}

    </div>

    {/* Focus mode — floating exit button */}
    {focusMode && (
      <button
        type="button"
        onClick={() => setFocusMode(false)}
        className="fixed top-4 right-4 z-[101] flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs rounded-full backdrop-blur-sm transition-all"
      >
        <Minimize2 size={12} />
        Exit focus · Esc
      </button>
    )}
    </Fragment>
  );
}
