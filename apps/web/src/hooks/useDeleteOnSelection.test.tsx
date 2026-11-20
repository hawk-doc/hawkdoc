import { renderHook } from '@testing-library/react';
import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $setSelection,
  createEditor,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import { $createImageNode, $isImageNode, ImageNode } from '../nodes/ImageNode';
import { useDeleteOnSelection } from './useDeleteOnSelection';

let currentEditor: LexicalEditor;
vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: () => [currentEditor],
}));

function setup() {
  const editor = createEditor({ nodes: [ImageNode], onError: (e) => { throw e; } });
  currentEditor = editor;
  const keys: string[] = [];
  editor.update(() => {
    const root = $getRoot();
    const a = $createImageNode('/a.png', 'a');
    const b = $createImageNode('/b.png', 'b');
    root.append($createParagraphNode(), a, b);
    keys.push(a.getKey(), b.getKey());
  }, { discrete: true });
  return { editor, keys };
}

function selectNodes(editor: LexicalEditor, nodeKeys: string[]) {
  editor.update(() => {
    const selection = $createNodeSelection();
    nodeKeys.forEach((k) => selection.add(k));
    $setSelection(selection);
  }, { discrete: true });
}

function imageCount(editor: LexicalEditor): number {
  return editor.getEditorState().read(() => $getRoot().getChildren().filter($isImageNode).length);
}

const keyEvent = (key: string) => new KeyboardEvent('keydown', { key, cancelable: true });

describe('useDeleteOnSelection', () => {
  it('removes the node-selected image and prevents the native deletion', () => {
    const { editor, keys } = setup();
    selectNodes(editor, [keys[0]]);
    renderHook(() => useDeleteOnSelection(keys[0], true));

    const event = keyEvent('Backspace');
    let handled = false;
    editor.update(() => { handled = editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event); }, { discrete: true });

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(imageCount(editor)).toBe(1);
  });

  it('removes every node in a multi-node selection with one key press', () => {
    const { editor, keys } = setup();
    selectNodes(editor, keys);
    renderHook(() => useDeleteOnSelection(keys[0], true));
    renderHook(() => useDeleteOnSelection(keys[1], true));

    editor.update(() => { editor.dispatchCommand(KEY_DELETE_COMMAND, keyEvent('Delete')); }, { discrete: true });

    expect(imageCount(editor)).toBe(0);
  });

  it('does nothing when the editor selection no longer contains the node', () => {
    const { editor, keys } = setup();
    // React state still says "selected", but the editor selection moved away.
    editor.update(() => { $getRoot().getFirstChildOrThrow().selectStart(); }, { discrete: true });
    renderHook(() => useDeleteOnSelection(keys[0], true));

    const event = keyEvent('Backspace');
    let handled = true;
    editor.update(() => { handled = editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event); }, { discrete: true });

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(imageCount(editor)).toBe(2);
  });

  it('registers no handler while the node is not selected', () => {
    const { editor, keys } = setup();
    selectNodes(editor, [keys[0]]);
    renderHook(() => useDeleteOnSelection(keys[0], false));

    let handled = true;
    editor.update(() => { handled = editor.dispatchCommand(KEY_DELETE_COMMAND, keyEvent('Delete')); }, { discrete: true });

    expect(handled).toBe(false);
    expect(imageCount(editor)).toBe(2);
  });
});
