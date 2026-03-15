import { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TablePlugin as LexicalTablePlugin } from '@lexical/react/LexicalTablePlugin';
import {
  $findCellNode,
  $findTableNode,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $isTableRowNode,
  INSERT_TABLE_COMMAND,
} from '@lexical/table';
import { $getSelection, $isRangeSelection } from 'lexical';
import { Plus, Trash2 } from 'lucide-react';

export { INSERT_TABLE_COMMAND };

function TableActionMenuPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setShowMenu(false);
          return;
        }
        const cell = $findCellNode(selection.anchor.getNode());
        if (!cell) {
          setShowMenu(false);
          return;
        }
        const domElement = editor.getElementByKey(cell.getKey());
        if (!domElement) {
          setShowMenu(false);
          return;
        }
        const rect = domElement.getBoundingClientRect();
        setMenuPos({ top: rect.top - 36, left: rect.right + 4 });
        setShowMenu(true);
      });
    });
  }, [editor]);

  const addRow = useCallback(() => {
    editor.update(() => {
      $insertTableRow__EXPERIMENTAL();
    });
  }, [editor]);

  const addColumn = useCallback(() => {
    editor.update(() => {
      $insertTableColumn__EXPERIMENTAL();
    });
  }, [editor]);

  const deleteRow = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const cell = $findCellNode(selection.anchor.getNode());
      const table = cell ? $findTableNode(cell) : null;
      if (!table) return;
      const rows = table.getChildren();
      if (rows.length <= 1) {
        table.remove();
        return;
      }
      $deleteTableRow__EXPERIMENTAL();
    });
  }, [editor]);

  const deleteColumn = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const cell = $findCellNode(selection.anchor.getNode());
      const table = cell ? $findTableNode(cell) : null;
      if (!table) return;
      const firstRow = table.getFirstChild();
      const colCount = firstRow && $isTableRowNode(firstRow) ? firstRow.getChildren().length : 0;
      if (colCount <= 1) {
        table.remove();
        return;
      }
      $deleteTableColumn__EXPERIMENTAL();
    });
  }, [editor]);

  if (!showMenu) return null;

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-notion-border px-1 py-0.5"
      style={{ top: menuPos.top, left: menuPos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ActionBtn title="Add row below" onClick={addRow}>
        <Plus size={12} />
        <span className="text-[10px]">Row</span>
      </ActionBtn>
      <ActionBtn title="Add column right" onClick={addColumn}>
        <Plus size={12} />
        <span className="text-[10px]">Col</span>
      </ActionBtn>
      <div className="w-px h-4 bg-notion-border mx-0.5" />
      <ActionBtn title="Delete row" onClick={deleteRow} danger>
        <Trash2 size={12} />
        <span className="text-[10px]">Row</span>
      </ActionBtn>
      <ActionBtn title="Delete column" onClick={deleteColumn} danger>
        <Trash2 size={12} />
        <span className="text-[10px]">Col</span>
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-xs transition-colors
        ${danger
          ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
          : 'text-notion-muted hover:text-notion-text hover:bg-notion-hover'
        }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function TablePlugin(): JSX.Element {
  return (
    <>
      <LexicalTablePlugin />
      <TableActionMenuPlugin />
    </>
  );
}
