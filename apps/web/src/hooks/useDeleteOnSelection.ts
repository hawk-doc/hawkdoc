import { useEffect } from 'react';
import {
  $getSelection,
  $isNodeSelection,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';

/**
 * Removes the block node `nodeKey` (and anything else in the same node
 * selection) on Backspace/Delete while it is node-selected.
 *
 * The editor selection is checked inside the command rather than trusting
 * `isSelected` alone: the React state can lag behind the editor, and when
 * several nodes are shift-click selected the first handler must remove all of
 * them, since returning `true` stops the other nodes' handlers from running.
 */
export function useDeleteOnSelection(nodeKey: string, isSelected: boolean): void {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!isSelected) return;

    const $onDelete = (event: KeyboardEvent | null): boolean => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection) || !selection.has(nodeKey)) return false;
      // Stop the browser's native deletion from also editing the text the DOM
      // caret still sits in.
      event?.preventDefault();
      selection.getNodes().forEach((node) => node.remove());
      return true;
    };

    return mergeRegister(
      editor.registerCommand(KEY_BACKSPACE_COMMAND, $onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, $onDelete, COMMAND_PRIORITY_LOW),
    );
  }, [editor, isSelected, nodeKey]);
}
