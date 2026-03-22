import { useEffect } from 'react';
import {
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  $getNodeByKey,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';

interface SerializedPageBreakNode extends SerializedLexicalNode {
  type: 'page-break';
  version: 1;
}

function PageBreakComponent({ nodeKey }: { nodeKey: string }) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        () => {
          if (isSelected) {
            editor.update(() => { $getNodeByKey(nodeKey)?.remove(); });
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        () => {
          if (isSelected) {
            editor.update(() => { $getNodeByKey(nodeKey)?.remove(); });
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, isSelected, nodeKey]);

  return (
    <div
      className={`page-break-node${isSelected ? ' selected' : ''}`}
      role="separator"
      aria-label="Page break"
      onClick={(e) => {
        e.stopPropagation();
        if (!e.shiftKey) clearSelection();
        setSelected(true);
      }}
    >
      <div className="page-break-node__line" />
      <span className="page-break-node__label">Page Break</span>
      <div className="page-break-node__line" />
    </div>
  );
}

export class PageBreakNode extends DecoratorNode<JSX.Element> {
  static getType(): string {
    return 'page-break';
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__key);
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  static importJSON(_serialized: SerializedPageBreakNode): PageBreakNode {
    return new PageBreakNode();
  }

  exportJSON(): SerializedPageBreakNode {
    return { type: 'page-break', version: 1 };
  }

  createDOM(): HTMLElement {
    return document.createElement('div');
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  decorate(_editor: LexicalEditor): JSX.Element {
    return <PageBreakComponent nodeKey={this.__key} />;
  }
}

export function $createPageBreakNode(): PageBreakNode {
  return new PageBreakNode();
}

export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}

