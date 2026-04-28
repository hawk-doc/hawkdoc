import { useEffect } from 'react';
import {
  $getNodeByKey,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';

export function useDeleteOnSelection(nodeKey: string, isSelected: boolean): void {
  const [editor] = useLexicalComposerContext();

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
}
