import {
  $createParagraphNode,
  $getRoot,
  $isDecoratorNode,
  $isParagraphNode,
  $isTextNode,
  $parseSerializedNode,
  type LexicalEditor,
  type SerializedEditorState,
  type SerializedElementNode,
} from 'lexical';

/** Marks the edit a restore makes, so it can be told apart in listeners */
export const RESTORE_TAG = 'version-restore';

/**
 * Put a past version back as the document's content.
 *
 * This is a normal edit rather than a state swap, which matters twice over:
 * collaborators receive it like any other change and the server records it as
 * a new version, so restoring is itself undoable and never destroys the
 * history it came from. Replacing the editor state outright would bypass Yjs
 * and quietly desynchronise everyone else.
 */
export function restoreEditorState(editor: LexicalEditor, state: SerializedEditorState): void {
  const children = (state.root as SerializedElementNode | undefined)?.children ?? [];

  editor.update(() => {
    const root = $getRoot();
    root.clear();

    for (const child of children) {
      const node = $parseSerializedNode(child);
      // A document's top level holds blocks. Anything inline — a stray text
      // node, or a template variable — has to be wrapped, or appending throws.
      const isInline = $isTextNode(node) || ($isDecoratorNode(node) && node.isInline());
      root.append(isInline ? $createParagraphNode().append(node) : node);
    }

    // Lexical needs somewhere to put the cursor, and a document ending in a
    // table or an image has nowhere to type.
    if (!$isParagraphNode(root.getLastChild())) {
      root.append($createParagraphNode());
    }
  }, { tag: RESTORE_TAG });
}
