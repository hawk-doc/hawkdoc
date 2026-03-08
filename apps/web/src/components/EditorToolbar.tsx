import { useCallback, useEffect, useRef, useState } from 'react';
import { InputDialog } from './InputDialog';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $createImageNode } from '../nodes/ImageNode';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isHeadingNode, $createHeadingNode } from '@lexical/rich-text';
import { $isQuoteNode, $createQuoteNode } from '@lexical/rich-text';
import { $isCodeNode, $createCodeNode } from '@lexical/code';
import {
  $isListNode,
  ListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { $getNearestNodeOfType } from '@lexical/utils';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code2,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
  Download,
  FileText,
  FileDown,
  Undo2,
  Redo2,
  Check,
  Globe,
  ImageIcon,
} from 'lucide-react';

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'code';

const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'h1', label: 'Heading 1' },
  { type: 'h2', label: 'Heading 2' },
  { type: 'h3', label: 'Heading 3' },
  { type: 'bullet', label: 'Bullet list' },
  { type: 'number', label: 'Numbered list' },
  { type: 'quote', label: 'Quote' },
  { type: 'code', label: 'Code block' },
];

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
  const [blockOpen, setBlockOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      const formData = new FormData();
      formData.append('image', file);

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/uploads`,
          { method: 'POST', body: formData },
        );
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json() as { url: string };
        const src = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}${url}`;
        editor.update(() => {
          const node = $createImageNode(src, file.name);
          $insertNodeToNearestRoot(node);
        });
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    },
    [editor],
  );

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    const element =
      anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElement();

    if (element) {
      if ($isHeadingNode(element)) {
        setBlockType(element.getTag() as BlockType);
      } else if ($isListNode(element)) {
        const parent = $getNearestNodeOfType(anchorNode, ListNode);
        setBlockType(parent?.getListType() === 'bullet' ? 'bullet' : 'number');
      } else if ($isQuoteNode(element)) {
        setBlockType('quote');
      } else if ($isCodeNode(element)) {
        setBlockType('code');
      } else {
        setBlockType('paragraph');
      }
    }

    setFormat({
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
      code: selection.hasFormat('code'),
      link: $isLinkNode(anchorNode.getParent()),
    });
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbar);
    });
  }, [editor, updateToolbar]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!blockRef.current?.contains(e.target as Node)) setBlockOpen(false);
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const changeBlockType = useCallback(
    (type: BlockType) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const el = selection.anchor.getNode().getTopLevelElement();
        if (!el) return;
        if (type === 'paragraph') el.replace($createParagraphNode());
        else if (type === 'h1' || type === 'h2' || type === 'h3')
          el.replace($createHeadingNode(type));
        else if (type === 'quote') el.replace($createQuoteNode());
        else if (type === 'code') el.replace($createCodeNode());
      });
      if (type === 'bullet') editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      if (type === 'number') editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      setBlockOpen(false);
      editor.focus();
    },
    [editor],
  );

  const toggleLink = useCallback(() => {
    if (!format.link) {
      setLinkDialogOpen(true);
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [editor, format.link]);

  const exportMarkdown = useCallback(() => {
    editor.getEditorState().read(() => {
      const md = $convertToMarkdownString(TRANSFORMERS);
      download(`${title || 'document'}.md`, md, 'text/markdown');
    });
    setExportOpen(false);
  }, [editor, title]);

  const exportHTML = useCallback(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const html = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>${title}</title></head>\n<body>\n${root.innerHTML}\n</body>\n</html>`;
    download(`${title || 'document'}.html`, html, 'text/html');
    setExportOpen(false);
  }, [editor, title]);

  const currentLabel = BLOCK_TYPES.find((b) => b.type === blockType)?.label ?? 'Paragraph';

  return (
    <>
    {linkDialogOpen && (
      <InputDialog
        title="Insert link"
        placeholder="https://..."
        confirmLabel="Insert"
        onConfirm={(url) => {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          setLinkDialogOpen(false);
          editor.focus();
        }}
        onCancel={() => { setLinkDialogOpen(false); editor.focus(); }}
      />
    )}
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-notion-border">
      <div className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap">
        {/* Undo / Redo */}
        <Btn title="Undo (⌘Z)" onMouseDown={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
          <Undo2 size={14} />
        </Btn>
        <Btn title="Redo (⌘⇧Z)" onMouseDown={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
          <Redo2 size={14} />
        </Btn>

        <Sep />

        {/* Block type dropdown */}
        <div className="relative" ref={blockRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-sm text-notion-text hover:bg-notion-hover transition-colors"
            onClick={() => setBlockOpen((v) => !v)}
          >
            <span className="min-w-[82px] text-left">{currentLabel}</span>
            <ChevronDown size={12} className="text-notion-muted" />
          </button>

          {blockOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-notion-border py-1 z-50">
              {BLOCK_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeBlockType(type);
                  }}
                >
                  <span>{label}</span>
                  {blockType === type && <Check size={12} className="text-notion-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* Text format */}
        <Btn title="Bold (⌘B)" active={format.bold} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>
          <Bold size={14} />
        </Btn>
        <Btn title="Italic (⌘I)" active={format.italic} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>
          <Italic size={14} />
        </Btn>
        <Btn title="Underline (⌘U)" active={format.underline} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}>
          <Underline size={14} />
        </Btn>
        <Btn title="Strikethrough" active={format.strikethrough} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}>
          <Strikethrough size={14} />
        </Btn>
        <Btn title="Inline code" active={format.code} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}>
          <Code2 size={14} />
        </Btn>
        <Btn title="Link" active={format.link} onMouseDown={toggleLink}>
          <Link size={14} />
        </Btn>
        <Btn title="Insert image" onMouseDown={() => imageInputRef.current?.click()}>
          <ImageIcon size={14} />
        </Btn>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        <Sep />

        {/* Alignment */}
        <Btn title="Align left" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}>
          <AlignLeft size={14} />
        </Btn>
        <Btn title="Align center" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}>
          <AlignCenter size={14} />
        </Btn>
        <Btn title="Align right" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}>
          <AlignRight size={14} />
        </Btn>
        <Btn title="Justify" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')}>
          <AlignJustify size={14} />
        </Btn>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save status */}
        <div className={`flex items-center gap-1.5 text-xs mr-2 ${isSaving ? 'text-notion-muted' : 'text-emerald-600'}`}>
          {isSaving ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-t-transparent border-notion-muted animate-spin inline-block" />
              Saving…
            </>
          ) : (
            <>
              <Check size={12} />
              Saved
            </>
          )}
        </div>

        <Sep />

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-3 bg-notion-text text-white rounded-lg text-sm font-medium hover:bg-opacity-80 transition-opacity"
            onClick={() => setExportOpen((v) => !v)}
          >
            <Download size={13} />
            Export
            <ChevronDown size={11} className="opacity-70" />
          </button>

          {exportOpen && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-notion-border py-1 z-50">
              <ExportItem
                icon={<FileText size={14} className="text-red-500" />}
                label="Export as PDF"
                onClick={() => { onExportPDF(); setExportOpen(false); }}
              />
              <ExportItem
                icon={<FileDown size={14} className="text-blue-500" />}
                label="Export as Markdown"
                onClick={exportMarkdown}
              />
              <ExportItem
                icon={<Globe size={14} className="text-orange-500" />}
                label="Export as HTML"
                onClick={exportHTML}
              />
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

function Btn({
  children,
  title,
  active,
  onMouseDown,
}: {
  children: React.ReactNode;
  title?: string;
  active?: boolean;
  onMouseDown?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors
        ${active
          ? 'bg-notion-hover text-notion-text'
          : 'text-notion-muted hover:bg-notion-hover hover:text-notion-text'
        }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown?.();
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-notion-border mx-0.5 flex-shrink-0" />;
}

function ExportItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-notion-text hover:bg-notion-hover transition-colors"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
