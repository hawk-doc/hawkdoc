import * as Y from 'yjs';
import { createEditor, type SerializedEditorState } from 'lexical';
import { createBinding, syncYjsChangesToLexical, type Provider } from '@lexical/yjs';
import { EDITOR_NODES, EDITOR_THEME } from '../../constants/editor';

/**
 * Reads a document's past state.
 *
 * A collaborative document lives in Yjs, not in Lexical's own serialised
 * format, so the only faithful way to read an old version is to replay it
 * through the same binding live collaboration uses. That gives us exactly what
 * the editor would have shown — images, tables and template variables
 * included — rather than a second, drifting interpretation of the Yjs tree.
 *
 * The editor here is never mounted: with no root element Lexical skips
 * rendering and only maintains state, which is all a version needs.
 */

const HISTORY_DOC_ID = 'version-history';

export class VersionDecodeError extends Error {
  constructor() {
    super('This version could not be read.');
    this.name = 'VersionDecodeError';
  }
}

/**
 * The binding expects a collaboration provider. Nothing here connects to
 * anything — a version is a fixed past state, so there are no peers, no
 * awareness and no cursors to track.
 */
function offlineProvider(): Provider {
  const noop = () => {};
  return {
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
    // `on`/`off` are overloaded per event name in the binding's Provider type;
    // one no-op satisfies all of them but not the overload signatures.
  } as unknown as Provider;
}

/** Rebuild the editor state a Yjs update represents */
export function editorStateFromYjsUpdate(update: Uint8Array): SerializedEditorState {
  const doc = new Y.Doc();
  const editor = createEditor({
    namespace: 'HawkDoc',
    nodes: EDITOR_NODES,
    theme: EDITOR_THEME,
    onError: (error: Error) => { throw error; },
  });
  const provider = offlineProvider();
  const binding = createBinding(editor, provider, HISTORY_DOC_ID, doc, new Map([[HISTORY_DOC_ID, doc]]));
  const shared = binding.root.getSharedType();

  const onYjsChanges = (events: Parameters<typeof syncYjsChangesToLexical>[2]) => {
    syncYjsChangesToLexical(binding, provider, events, false);
  };

  shared.observeDeep(onYjsChanges);
  try {
    Y.applyUpdate(doc, update);
  } catch {
    throw new VersionDecodeError();
  } finally {
    shared.unobserveDeep(onYjsChanges);
  }

  // The sync above ran inside a Yjs transaction, which leaves Lexical's work
  // pending. A discrete update commits it, so the state can be read back.
  editor.update(() => {}, { discrete: true });

  return editor.getEditorState().toJSON();
}
