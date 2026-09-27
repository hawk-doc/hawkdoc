import * as Y from 'yjs';
import { createEditor, type LexicalEditor } from 'lexical';
import { createBinding, syncLexicalUpdateToYjs, type Provider } from '@lexical/yjs';
import { EDITOR_NODES, EDITOR_THEME } from '../constants/editor';

/**
 * Builds the Yjs state a collaborative document would hold after `build` runs
 * in the editor — the shape the API stores versions in, so tests can check
 * what the app reads back rather than a hand-written approximation.
 */
export function yjsUpdateFor(build: () => void): Uint8Array {
  const doc = new Y.Doc();
  const editor: LexicalEditor = createEditor({
    namespace: 'HawkDoc',
    nodes: EDITOR_NODES,
    theme: EDITOR_THEME,
    onError: (error: Error) => { throw error; },
  });
  const noop = () => {};
  const provider = {
    awareness: {
      getLocalState: () => null,
      getStates: () => new Map(),
      setLocalState: noop,
      on: noop,
      off: noop,
    },
    connect: noop,
    disconnect: noop,
    on: noop,
    off: noop,
  } as unknown as Provider;

  const binding = createBinding(editor, provider, 'test', doc, new Map([['test', doc]]));
  editor.registerUpdateListener(
    ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
      syncLexicalUpdateToYjs(
        binding, provider, prevEditorState, editorState,
        dirtyElements, dirtyLeaves, normalizedNodes, tags,
      );
    },
  );

  editor.update(build, { discrete: true });
  return Y.encodeStateAsUpdate(doc);
}
