import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  createEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type LexicalEditor,
  type SerializedEditorState,
  type SerializedElementNode,
  type SerializedTextNode,
} from 'lexical';
import { $createHeadingNode } from '@lexical/rich-text';
import { createBinding, syncLexicalUpdateToYjs, type Provider } from '@lexical/yjs';
import { restoreEditorState, RESTORE_TAG } from './restore';
import { editorStateFromYjsUpdate } from './decode';
import { EDITOR_NODES, EDITOR_THEME } from '../../constants/editor';
import { $createTemplateVariableNode } from '../../nodes/TemplateVariableNode';
import { $createImageNode } from '../../nodes/ImageNode';

function newEditor(): LexicalEditor {
  return createEditor({
    namespace: 'HawkDoc',
    nodes: EDITOR_NODES,
    theme: EDITOR_THEME,
    onError: (error: Error) => { throw error; },
  });
}

/** The editor state produced by running `build`, serialised */
function stateOf(build: () => void): SerializedEditorState {
  const editor = newEditor();
  editor.update(build, { discrete: true });
  return editor.getEditorState().toJSON();
}

function blocks(state: SerializedEditorState): SerializedElementNode['children'] {
  return (state.root as SerializedElementNode).children;
}

function textIn(node: unknown): string {
  const element = node as SerializedElementNode;
  if (!element.children) return (node as SerializedTextNode).text ?? '';
  return element.children.map(textIn).join('');
}

describe('restoreEditorState', () => {
  it('replaces the document with the version and keeps its structure', () => {
    const version = stateOf(() => {
      const heading = $createHeadingNode('h1');
      heading.append($createTextNode('Old title'));
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('Old body'));
      $getRoot().append(heading, paragraph);
    });

    const editor = newEditor();
    editor.update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('current text that should go away'));
      $getRoot().append(paragraph);
    }, { discrete: true });

    restoreEditorState(editor, version);
    editor.update(() => {}, { discrete: true });

    const state = editor.getEditorState().toJSON();
    expect(blocks(state)).toHaveLength(2);
    expect(blocks(state)[0]).toMatchObject({ type: 'heading', tag: 'h1' });
    expect(blocks(state).map(textIn)).toEqual(['Old title', 'Old body']);
  });

  it('carries images and template variables back', () => {
    const version = stateOf(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('Dear '), $createTemplateVariableNode('customer_name'));
      $getRoot().append(paragraph, $createImageNode('http://api.test/uploads/a.png', 'A chart'));
    });

    const editor = newEditor();
    restoreEditorState(editor, version);
    editor.update(() => {}, { discrete: true });

    const state = editor.getEditorState().toJSON();
    const paragraph = blocks(state)[0] as SerializedElementNode;
    expect(paragraph.children[1]).toMatchObject({
      type: 'template-variable',
      variableName: 'customer_name',
    });
    expect(blocks(state)[1]).toMatchObject({ type: 'image', alt: 'A chart' });
  });

  it('leaves a paragraph to type in when the version ends with an image', () => {
    const version = stateOf(() => {
      $getRoot().append($createImageNode('http://api.test/uploads/a.png', 'A chart'));
    });

    const editor = newEditor();
    restoreEditorState(editor, version);
    editor.update(() => {}, { discrete: true });

    const restored = blocks(editor.getEditorState().toJSON());
    const trailing = restored[restored.length - 1];
    expect(trailing).toMatchObject({ type: 'paragraph' });
  });

  it('handles an empty version without leaving the document unusable', () => {
    const editor = newEditor();
    editor.update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('will be cleared'));
      $getRoot().append(paragraph);
    }, { discrete: true });

    restoreEditorState(editor, stateOf(() => {}));
    editor.update(() => {}, { discrete: true });

    const state = editor.getEditorState().toJSON();
    expect(blocks(state)).toHaveLength(1);
    expect(blocks(state)[0]).toMatchObject({ type: 'paragraph' });
    expect(textIn(blocks(state)[0])).toBe('');
  });

  it('tags the edit so listeners can recognise a restore', () => {
    const editor = newEditor();
    const tags: string[] = [];
    editor.registerUpdateListener(({ tags: updateTags }) => { tags.push(...updateTags); });

    restoreEditorState(editor, stateOf(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('back'));
      $getRoot().append(paragraph);
    }));
    editor.update(() => {}, { discrete: true });

    expect(tags).toContain(RESTORE_TAG);
  });

  it('reaches collaborators, because it is an ordinary edit', () => {
    // A restore that bypassed Yjs would leave everyone else on the old
    // content, so check the change lands in the shared document.
    const doc = new Y.Doc();
    const editor = newEditor();
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
    const binding = createBinding(editor, provider, 'live', doc, new Map([['live', doc]]));
    editor.registerUpdateListener(
      ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
        syncLexicalUpdateToYjs(
          binding, provider, prevEditorState, editorState,
          dirtyElements, dirtyLeaves, normalizedNodes, tags,
        );
      },
    );

    editor.update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('live content'));
      $getRoot().append(paragraph);
    }, { discrete: true });

    restoreEditorState(editor, stateOf(() => {
      const heading = $createHeadingNode('h2');
      heading.append($createTextNode('restored heading'));
      $getRoot().append(heading);
    }));
    editor.update(() => {}, { discrete: true });

    // What a collaborator would now see
    const shared = editorStateFromYjsUpdate(Y.encodeStateAsUpdate(doc));
    expect(blocks(shared).map(textIn).join('')).toContain('restored heading');
    expect(blocks(shared).map(textIn).join('')).not.toContain('live content');
  });
});
