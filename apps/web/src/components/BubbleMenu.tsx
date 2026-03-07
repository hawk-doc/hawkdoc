import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { InputDialog } from './InputDialog';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { Bold, Italic, Underline, Strikethrough, Code2, Link } from 'lucide-react';

interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
}

interface BubbleMenuProps {
  editor: LexicalEditor;
}

export function BubbleMenu({ editor }: BubbleMenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [format, setFormat] = useState<FormatState>({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
    link: false,
  });
  const ref = useRef<HTMLDivElement>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setPos(null);
          return;
        }

        const anchorNode = selection.anchor.getNode();
        setFormat({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strikethrough: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
          link: $isLinkNode(anchorNode.getParent()),
        });

        const domSel = window.getSelection();
        if (!domSel || domSel.rangeCount === 0) return;
        const range = domSel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        setPos({
          top: rect.top - 48,
          left: rect.left + rect.width / 2,
        });
      });
    });
  }, [editor]);

  const toggleLink = useCallback(() => {
    if (!format.link) {
      setLinkDialogOpen(true);
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [editor, format.link]);

  if (linkDialogOpen) {
    return (
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
    );
  }

  if (!pos) return null;

  const BUTTONS = [
    { icon: <Bold size={13} />, fmt: 'bold' as const, active: format.bold, title: 'Bold' },
    { icon: <Italic size={13} />, fmt: 'italic' as const, active: format.italic, title: 'Italic' },
    { icon: <Underline size={13} />, fmt: 'underline' as const, active: format.underline, title: 'Underline' },
    { icon: <Strikethrough size={13} />, fmt: 'strikethrough' as const, active: format.strikethrough, title: 'Strikethrough' },
    { icon: <Code2 size={13} />, fmt: 'code' as const, active: format.code, title: 'Inline code' },
  ];

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-0.5 bg-[#1f1f1f] rounded-lg shadow-2xl px-1.5 py-1 -translate-x-1/2 pointer-events-auto"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {BUTTONS.map(({ icon, fmt, active, title }) => (
        <button
          key={fmt}
          type="button"
          title={title}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors
            ${active ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
          }}
        >
          {icon}
        </button>
      ))}

      <div className="w-px h-4 bg-white/20 mx-0.5" />

      <button
        type="button"
        title="Link"
        className={`w-7 h-7 flex items-center justify-center rounded transition-colors
          ${format.link ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleLink();
        }}
      >
        <Link size={13} />
      </button>
    </div>,
    document.body,
  );
}
