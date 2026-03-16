import { useCallback, useEffect, useMemo, useRef, useState, createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
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
import { DocumentPDF } from './DocumentPDF';
import { $createTemplateVariableNode } from '../nodes/TemplateVariableNode';
import { TablePlugin } from './TablePlugin';
import { useAutoSave, loadAutoSave } from '../hooks/useAutoSave';
import { TEMPLATE_VAR_REGEX, EDITOR_THEME, EDITOR_NODES } from '../constants/editor';
import type { SlashMenuState } from '../types/editor';

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
  title: string;
  onTitleChange: (title: string) => void;
}

export function Editor({ title, onTitleChange }: EditorProps) {
  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [initialContent] = useState<string | null>(() => loadAutoSave()?.content ?? null);

  const isSaving = useAutoSave(editorState, title);

  const wordCount = useMemo(() => {
    if (!editorState) return 0;
    let text = '';
    editorState.read(() => { text = $getRoot().getTextContent(); });
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [editorState]);

  const handleExportPDF = useCallback(async () => {
    if (!editorState || isExporting) return;
    setIsExporting(true);
    try {
      const element = createElement(DocumentPDF, {
        editorState: editorState.toJSON(),
        title,
        watermark: 'HawkDoc',
      });
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'document'}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [editorState, title, isExporting]);

  const initialConfig = {
    namespace: 'HawkDoc',
    theme: EDITOR_THEME,
    nodes: EDITOR_NODES,
    onError: (error: Error) => { console.error('Lexical error:', error); },
  };

  return (
    <div className="flex flex-col min-h-full">

      {/* Toolbar */}
      {editorInstance && (
        <EditorToolbar
          editor={editorInstance}
          onExportPDF={handleExportPDF}
          isSaving={isSaving || isExporting}
          title={title}
        />
      )}

      {/* Gray canvas */}
      <div className="flex-1 py-10 bg-[#e8eaed] overflow-x-auto">

        {/* Centered A4 paper */}
        <div style={{ width: 794, margin: '0 auto' }}>

          {/* White paper */}
          <div
            className="bg-white"
            style={{
              padding: 72,
              minHeight: 1123,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.10)',
            }}
          >
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
                <TablePlugin />
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

          {/* Status bar */}
          <div className="mt-3 flex items-center justify-between px-1">
            <span className="text-xs text-[#80868b]">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            <span className="text-xs text-[#80868b]">
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
  );
}
