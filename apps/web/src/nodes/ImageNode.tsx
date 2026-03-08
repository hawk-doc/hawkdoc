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

interface SerializedImageNode extends SerializedLexicalNode {
  src: string;
  alt: string;
  version: 1;
}

function ImageComponent({ src, alt, nodeKey }: { src: string; alt: string; nodeKey: string }) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        () => {
          if (isSelected) {
            editor.update(() => {
              $getNodeByKey(nodeKey)?.remove();
            });
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
            editor.update(() => {
              $getNodeByKey(nodeKey)?.remove();
            });
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, isSelected, nodeKey]);

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`max-w-full h-auto block my-3 rounded-md cursor-pointer transition-all
        ${isSelected ? 'ring-2 ring-violet-500 ring-offset-2' : 'hover:ring-1 hover:ring-notion-border'}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!e.shiftKey) clearSelection();
        setSelected(true);
      }}
    />
  );
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __alt: string;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__key);
  }

  constructor(src: string, alt: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    return new ImageNode(serialized.src, serialized.alt);
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      src: this.__src,
      alt: this.__alt,
      version: 1,
    };
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
    return <ImageComponent src={this.__src} alt={this.__alt} nodeKey={this.__key} />;
  }
}

export function $createImageNode(src: string, alt: string): ImageNode {
  return new ImageNode(src, alt);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
