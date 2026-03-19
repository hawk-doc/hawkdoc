import { useCallback, useEffect, useRef, useState } from 'react';
import { InputDialog } from './InputDialog';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from 'lexical';
import { $patchStyleText, $getSelectionStyleValueForProperty } from '@lexical/selection';
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
import { $getNearestNodeOfType, $insertNodeToNearestRoot } from '@lexical/utils';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { $createImageNode } from '../nodes/ImageNode';
import { BLOCK_TYPES, FONT_FAMILIES, FONT_SIZES } from '../constants/editor';
import type { BlockType, EditorToolbarProps } from '../types/editor';
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
  ImagePlus,
} from 'lucide-react';


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
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontSize, setFontSize] = useState('16');
  const [fontSizeInput, setFontSizeInput] = useState('16');
  const [blockOpen, setBlockOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const fontFamilyRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Font family
    const rawFamily = $getSelectionStyleValueForProperty(selection, 'font-family', 'Inter');
    const normalizedFamily = rawFamily.replace(/['"]/g, '').split(',')[0].trim();
    const matchedFamily = FONT_FAMILIES.find(
      (f) => f.label.toLowerCase() === normalizedFamily.toLowerCase(),
    );
    setFontFamily(matchedFamily?.label ?? 'Inter');

    // Font size
    const rawSize = $getSelectionStyleValueForProperty(selection, 'font-size', '16px');
    const sizeNum = rawSize.replace('px', '').trim();
    setFontSize(sizeNum || '16');
    setFontSizeInput(sizeNum || '16');
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
      if (!fontFamilyRef.current?.contains(e.target as Node)) setFontFamilyOpen(false);
      if (!fontSizeRef.current?.contains(e.target as Node)) setFontSizeOpen(false);
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

  const applyFontFamily = useCallback(
    (label: string) => {
      const family = FONT_FAMILIES.find((f) => f.label === label);
      if (!family) return;
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        $patchStyleText(selection, { 'font-family': family.css });
      });
      setFontFamily(label);
      setFontFamilyOpen(false);
      editor.focus();
    },
    [editor],
  );

  const applyFontSize = useCallback(
    (size: string) => {
      const num = parseInt(size, 10);
      if (!num || num < 1 || num > 400) return;
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        $patchStyleText(selection, { 'font-size': `${num}px` });
      });
      setFontSize(String(num));
      setFontSizeInput(String(num));
      setFontSizeOpen(false);
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

  const handleImageUpload = useCallback(
    async (file: File) => {
      const apiUrl =
        (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch(`${apiUrl}/api/uploads`, { method: 'POST', body: formData });
        const { url } = (await res.json()) as { url: string };
        editor.update(() => {
          $insertNodeToNearestRoot($createImageNode(`${apiUrl}${url}`, file.name));
        });
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    },
    [editor],
  );

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
    <div className="sticky top-0 z-40 bg-white border-b border-[#dadce0]">
      <div className="flex items-center gap-0.5 px-2 py-1 flex-wrap">
        {/* Undo / Redo */}
        <Btn title="Undo (⌘Z)" onMouseDown={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
          <Undo2 size={16} />
        </Btn>
        <Btn title="Redo (⌘⇧Z)" onMouseDown={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
          <Redo2 size={16} />
        </Btn>

        <Sep />

        {/* Block type dropdown */}
        <div className="relative" ref={blockRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-sm text-[#444746] hover:bg-[#f1f3f4] transition-colors"
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

        {/* Font family dropdown */}
        <div className="relative" ref={fontFamilyRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-sm text-[#444746] hover:bg-[#f1f3f4] transition-colors"
            onClick={() => setFontFamilyOpen((v) => !v)}
            style={{ fontFamily }}
          >
            <span className="min-w-[110px] text-left truncate">{fontFamily}</span>
            <ChevronDown size={12} className="text-notion-muted flex-shrink-0" />
          </button>

          {fontFamilyOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-notion-border py-1 z-50">
              {FONT_FAMILIES.map(({ label, css }) => (
                <button
                  key={label}
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover transition-colors"
                  style={{ fontFamily: css }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyFontFamily(label);
                  }}
                >
                  <span>{label}</span>
                  {fontFamily === label && <Check size={12} className="text-notion-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font size */}
        <div className="relative" ref={fontSizeRef}>
          <div className="flex items-center h-7 rounded-md border border-notion-border overflow-hidden">
            <input
              type="text"
              value={fontSizeInput}
              onChange={(e) => setFontSizeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyFontSize(fontSizeInput);
                }
              }}
              onBlur={() => applyFontSize(fontSizeInput)}
              onFocus={() => setFontSizeOpen(true)}
              className="w-10 text-center text-sm text-notion-text bg-transparent px-1 focus:outline-none"
              aria-label="Font size"
            />
            <button
              type="button"
              className="px-1 h-full hover:bg-notion-hover transition-colors flex items-center border-l border-notion-border"
              onMouseDown={(e) => {
                e.preventDefault();
                setFontSizeOpen((v) => !v);
              }}
            >
              <ChevronDown size={10} className="text-notion-muted" />
            </button>
          </div>

          {fontSizeOpen && (
            <div className="absolute top-full left-0 mt-1 w-20 bg-white rounded-xl shadow-xl border border-notion-border py-1 z-50 max-h-56 overflow-y-auto">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-1 text-sm text-notion-text hover:bg-notion-hover transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyFontSize(size);
                  }}
                >
                  <span>{size}</span>
                  {fontSize === size && <Check size={10} className="text-notion-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* Text format */}
        <Btn title="Bold (⌘B)" active={format.bold} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>
          <Bold size={16} />
        </Btn>
        <Btn title="Italic (⌘I)" active={format.italic} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>
          <Italic size={16} />
        </Btn>
        <Btn title="Underline (⌘U)" active={format.underline} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}>
          <Underline size={16} />
        </Btn>
        <Btn title="Strikethrough" active={format.strikethrough} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}>
          <Strikethrough size={16} />
        </Btn>
        <Btn title="Inline code" active={format.code} onMouseDown={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}>
          <Code2 size={16} />
        </Btn>
        <Btn title="Link" active={format.link} onMouseDown={toggleLink}>
          <Link size={16} />
        </Btn>

        <Sep />

        {/* Alignment */}
        <Btn title="Align left" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}>
          <AlignLeft size={16} />
        </Btn>
        <Btn title="Align center" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}>
          <AlignCenter size={16} />
        </Btn>
        <Btn title="Align right" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}>
          <AlignRight size={16} />
        </Btn>
        <Btn title="Justify" onMouseDown={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')}>
          <AlignJustify size={16} />
        </Btn>

        <Sep />

        {/* Image upload */}
        <Btn title="Upload image" onMouseDown={() => fileInputRef.current?.click()}>
          <ImagePlus size={16} />
        </Btn>
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
      className={`w-8 h-8 flex items-center justify-center rounded transition-colors
        ${active
          ? 'bg-[#d3e3fd] text-[#1a73e8]'
          : 'text-[#444746] hover:bg-[#f1f3f4]'
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
  return <div className="w-px h-5 bg-[#dadce0] mx-1 flex-shrink-0" />;
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
