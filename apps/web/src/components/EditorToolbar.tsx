import { useCallback, useEffect, useRef, useState } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {
  $isHeadingNode,
  $createHeadingNode,
  $isQuoteNode,
  $createQuoteNode,
} from '@lexical/rich-text';
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { $isCodeNode, $createCodeNode } from '@lexical/code';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code2,
  Link2,
  Download,
  ChevronDown,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import { InputDialog } from './InputDialog';
import { $createImageNode } from '../nodes/ImageNode';

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'code' | 'quote';

const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  bullet: 'Bullet List',
  number: 'Numbered List',
  code: 'Code Block',
  quote: 'Quote',
};

interface EditorToolbarProps {
  editor: LexicalEditor;
  onExportPDF: () => void;
  isSaving: boolean;
  title: string;
}

export function EditorToolbar({ editor, onExportPDF, isSaving, title }: EditorToolbarProps) {
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const [format, setFormat] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
    link: false,
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        const topElement = anchorNode.getTopLevelElement();
        if (!topElement) return;

        if ($isHeadingNode(topElement)) {
          setBlockType(topElement.getTag() as BlockType);
        } else if ($isListNode(topElement)) {
          setBlockType(topElement.getListType() === 'bullet' ? 'bullet' : 'number');
        } else if ($isCodeNode(topElement)) {
          setBlockType('code');
        } else if ($isQuoteNode(topElement)) {
          setBlockType('quote');
        } else {
          setBlockType('paragraph');
        }

        setFormat({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strikethrough: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
          link: $isLinkNode(anchorNode.getParent()),
        });
      });
    });
  }, [editor]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (blockMenuRef.current && !blockMenuRef.current.contains(e.target as Node)) {
        setBlockMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const applyBlockType = useCallback(
    (type: BlockType) => {
      if (type === 'bullet') {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        setBlockMenuOpen(false);
        return;
      }
      if (type === 'number') {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        setBlockMenuOpen(false);
        return;
      }
      if (blockType === 'bullet' || blockType === 'number') {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      }
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;

        if (type === 'paragraph') {
          const para = $createParagraphNode();
          parent.replace(para);
          para.select();
        } else if (type === 'h1' || type === 'h2' || type === 'h3') {
          const heading = $createHeadingNode(type);
          parent.replace(heading);
          heading.select();
        } else if (type === 'quote') {
          const quote = $createQuoteNode();
          parent.replace(quote);
          quote.select();
        } else if (type === 'code') {
          const code = $createCodeNode();
          parent.replace(code);
          code.select();
        }
      });
      setBlockMenuOpen(false);
    },
    [editor, blockType],
  );

  const handleExportMarkdown = useCallback(() => {
    let markdown = '';
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(TRANSFORMERS);
    });
    const blob = new Blob([`# ${title}\n\n${markdown}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [editor, title]);

  const handleExportHTML = useCallback(() => {
    const rootEl = editor.getRootElement();
    if (!rootEl) return;
    const content = rootEl.innerHTML;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${content}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'document'}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [editor, title]);

  const handleImageUpload = useCallback(
    async (file: File) => {
      const apiUrl =
        (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch(`${apiUrl}/api/uploads`, { method: 'POST', body: formData });
        const { url } = (await res.json()) as { url: string };
        const src = `${apiUrl}${url}`;
        editor.update(() => {
          $insertNodeToNearestRoot($createImageNode(src, file.name));
        });
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    },
    [editor],
  );

  const FORMATS = [
    { key: 'bold', icon: <Bold size={14} />, cmd: 'bold' as const, active: format.bold, label: 'Bold' },
    { key: 'italic', icon: <Italic size={14} />, cmd: 'italic' as const, active: format.italic, label: 'Italic' },
    { key: 'underline', icon: <Underline size={14} />, cmd: 'underline' as const, active: format.underline, label: 'Underline' },
    { key: 'strikethrough', icon: <Strikethrough size={14} />, cmd: 'strikethrough' as const, active: format.strikethrough, label: 'Strikethrough' },
    { key: 'code', icon: <Code2 size={14} />, cmd: 'code' as const, active: format.code, label: 'Inline code' },
  ] as const;

  return (
    <div className="flex-shrink-0 sticky top-0 z-40 bg-white border-b border-notion-border px-4 py-2 flex items-center gap-1 flex-wrap">
      {/* Block type picker */}
      <div className="relative" ref={blockMenuRef}>
        <button
          type="button"
          onClick={() => setBlockMenuOpen((o) => !o)}
          className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-notion-muted hover:bg-notion-hover hover:text-notion-text transition-colors"
        >
          {BLOCK_LABELS[blockType]}
          <ChevronDown size={12} />
        </button>
        {blockMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-notion-border py-1 w-40 z-50">
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
              <button
                key={type}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-notion-hover transition-colors ${
                  blockType === type ? 'text-notion-text font-medium' : 'text-notion-muted'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyBlockType(type);
                }}
              >
                {BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      {/* Format buttons */}
      {FORMATS.map(({ key, icon, cmd, active, label }) => (
        <button
          key={key}
          type="button"
          title={label}
          className={`toolbar-btn ${active ? 'active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, cmd);
          }}
        >
          {icon}
        </button>
      ))}

      {/* Link */}
      <button
        type="button"
        title="Link"
        className={`toolbar-btn ${format.link ? 'active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          if (format.link) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
          } else {
            setLinkDialogOpen(true);
          }
        }}
      >
        <Link2 size={14} />
      </button>

      <div className="toolbar-divider" />

      {/* Image upload */}
      <button
        type="button"
        title="Upload image"
        className="toolbar-btn"
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus size={14} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImageUpload(file);
          e.target.value = '';
        }}
      />

      <div className="ml-auto flex items-center gap-2">
        {isSaving && (
          <span className="flex items-center gap-1 text-xs text-notion-muted">
            <Loader2 size={11} className="animate-spin" />
            Saving…
          </span>
        )}

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => setExportOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-notion-muted border border-notion-border hover:bg-notion-hover hover:text-notion-text transition-colors"
          >
            <Download size={13} />
            Export
            <ChevronDown size={11} />
          </button>
          {exportOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-notion-border py-1 w-40 z-50">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-notion-muted hover:bg-notion-hover hover:text-notion-text transition-colors"
                onClick={() => {
                  onExportPDF();
                  setExportOpen(false);
                }}
              >
                Export as PDF
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-notion-muted hover:bg-notion-hover hover:text-notion-text transition-colors"
                onClick={handleExportMarkdown}
              >
                Export as Markdown
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-notion-muted hover:bg-notion-hover hover:text-notion-text transition-colors"
                onClick={handleExportHTML}
              >
                Export as HTML
              </button>
            </div>
          )}
        </div>
      </div>

      {linkDialogOpen && (
        <InputDialog
          title="Insert link"
          placeholder="https://..."
          confirmLabel="Insert"
          onConfirm={(url) => {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
            setLinkDialogOpen(false);
          }}
          onCancel={() => setLinkDialogOpen(false)}
        />
      )}
    </div>
  );
}
