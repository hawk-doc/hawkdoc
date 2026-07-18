import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InputDialog } from './InputDialog';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createParagraphNode,
  type LexicalEditor,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import {
  $createHeadingNode,
  $createQuoteNode,
} from '@lexical/rich-text';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import { $createCodeNode } from '@lexical/code';
import { $createHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { $createTemplateVariableNode } from '../nodes/TemplateVariableNode';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { $createPageBreakNode } from '../nodes/PageBreakNode';
import type { SlashCommand } from '../interfaces';

const COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    shortcut: '#',
    execute: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;
        const heading = $createHeadingNode('h1');
        parent.replace(heading);
        heading.select();
      });
    },
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    shortcut: '##',
    execute: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;
        const heading = $createHeadingNode('h2');
        parent.replace(heading);
        heading.select();
      });
    },
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    shortcut: '###',
    execute: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;
        const heading = $createHeadingNode('h3');
        parent.replace(heading);
        heading.select();
      });
    },
  },
  {
    id: 'paragraph',
    label: 'Paragraph',
    description: 'Plain text block',
    icon: '¶',
    execute: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;
        const paragraph = $createParagraphNode();
        parent.replace(paragraph);
        paragraph.select();
      });
    },
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    shortcut: '-',
    execute: (editor) => {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    },
  },
  {
    id: 'numbered',
    label: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    shortcut: '1.',
    execute: (editor) => {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    },
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Block quotation',
    icon: '"',
    shortcut: '>',
    execute: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;
        const quote = $createQuoteNode();
        parent.replace(quote);
        quote.select();
      });
    },
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Monospace code block',
    icon: '</>',
    shortcut: '```',
    execute: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        const parent = node.getTopLevelElement();
        if (!parent) return;
        const code = $createCodeNode();
        parent.replace(code);
        code.select();
      });
    },
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a table',
    icon: '⊞',
    execute: (editor) => {
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        rows: '3',
        columns: '3',
        includeHeaders: { rows: true, columns: false },
      });
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    icon: '—',
    shortcut: '---',
    execute: (editor) => {
      editor.update(() => {
        const hr = $createHorizontalRuleNode();
        $insertNodeToNearestRoot(hr);
      });
    },
  },
  {
    id: 'page-break',
    label: 'Page Break',
    description: 'Force a new page in PDF export',
    icon: '⌧',
    execute: (editor) => {
      editor.update(() => {
        const node = $createPageBreakNode();
        $insertNodeToNearestRoot(node);
        const paragraph = $createParagraphNode();
        node.insertAfter(paragraph);
        paragraph.select();
      });
    },
  },
  {
    id: 'template-variable',
    label: 'Template Variable',
    description: 'Insert {{variable}} placeholder',
    icon: '{{}}',
    shortcut: '{{}}',
    execute: () => { /* handled by SlashCommandMenu with InputDialog */ },
  },
];

interface SlashCommandMenuProps {
  editor: LexicalEditor;
  query: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function SlashCommandMenu({
  editor,
  query,
  anchorRect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [varDialogOpen, setVarDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      COMMANDS.filter(
        (cmd) =>
          query === '' ||
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.id.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  const removeSlashText = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node)) return;
      const text = node.getTextContent();
      const slashIndex = text.lastIndexOf('/');
      if (slashIndex !== -1) {
        node.spliceText(slashIndex, text.length - slashIndex, '');
      }
    });
  }, [editor]);

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      removeSlashText();

      if (cmd.id === 'template-variable') {
        setVarDialogOpen(true);
        return; // keep component mounted for the dialog
      }

      cmd.execute(editor);
      onClose();
    },
    [editor, onClose, removeSlashText],
  );

  // Keyboard navigation
  useEffect(() => {
    const removeDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
    const removeUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
    const removeEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const removeEsc = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        onClose();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removeDown();
      removeUp();
      removeEnter();
      removeEsc();
    };
  }, [editor, filtered, selectedIndex, executeCommand, onClose]);

  // Close on any scroll (capture catches non-bubbling scroll on overflow containers)
  useEffect(() => {
    document.addEventListener('scroll', onClose, { capture: true });
    return () => document.removeEventListener('scroll', onClose, { capture: true });
  }, [onClose]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (varDialogOpen) {
    return (
      <InputDialog
        title="Template variable"
        placeholder="variable_name"
        confirmLabel="Insert"
        onConfirm={(varName) => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            selection.insertNodes([$createTemplateVariableNode(varName)]);
          });
          onClose();
        }}
        onCancel={onClose}
      />
    );
  }

  if (filtered.length === 0) return null;

  const top = anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - 300);

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{ top, left, position: 'fixed' }}
    >
      {filtered.map((cmd, index) => (
        <button
          key={cmd.id}
          type="button"
          className={`slash-menu-item w-full text-left ${index === selectedIndex ? 'selected' : ''}`}
          onMouseEnter={() => setSelectedIndex(index)}
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand(cmd);
          }}
        >
          <span className="slash-menu-item-icon">{cmd.icon}</span>
          <span className="flex-1 min-w-0">
            <span className="font-medium">{cmd.label}</span>
            <span className="block text-xs text-notion-muted">{cmd.description}</span>
          </span>
          {cmd.shortcut && (
            <kbd className="ml-3 flex-shrink-0 text-[10px] font-mono text-notion-muted dark:text-[#9aa0a6] bg-[#f1f3f4] dark:bg-[#3c4043] px-1.5 py-0.5 rounded border border-[#dadce0] dark:border-[#5f6368]">
              {cmd.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
}
