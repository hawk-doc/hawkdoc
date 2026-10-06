import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createEditor,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  $isTextNode,
  type LexicalEditor,
} from 'lexical';
import { $createHeadingNode } from '@lexical/rich-text';
import { EditorToolbar } from './EditorToolbar';
import { AuthProvider } from '../context/AuthContext';
import { EDITOR_NODES } from '../constants/editor';

/** Creates a headless editor with the application node types for toolbar tests. */
function makeEditor(): LexicalEditor {
  return createEditor({ nodes: EDITOR_NODES, onError: (error: Error) => { throw error; } });
}

/** Counts commits of the toolbar's subtree */
function mountToolbar(editor: LexicalEditor) {
  const counter = { commits: 0 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /** Wraps the toolbar in its providers and records React commits with a profiler. */
  const tree = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Profiler id="toolbar" onRender={() => { counter.commits += 1; }}>
          {children}
        </Profiler>
      </AuthProvider>
    </QueryClientProvider>
  );

  render(tree(
    <EditorToolbar
      editor={editor}
      onExportPDF={vi.fn()}
      onExportDOCX={vi.fn()}
      onImportDOCX={vi.fn()}
      onOpenHistory={vi.fn()}
      isSaving={false}
      title="Notes"
      onToggleFocusMode={vi.fn()}
    />,
  ));

  return counter;
}

/** The document's single text node */
function textNode() {
  const node = $getRoot().getLastDescendant();
  if (!$isTextNode(node)) throw new Error('expected a text node');
  return node;
}

/** A paragraph with the caret at the end of it, as if just typed into */
function seed(editor: LexicalEditor): void {
  act(() => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode().append($createTextNode('hawk')));
      root.selectEnd();
    }, { discrete: true });
  });
}

/**
 * Types one character. An editor with no root element has no DOM selection to
 * restore, so each update places the caret before inserting, the way a real
 * keystroke arrives with one.
 */
function type(editor: LexicalEditor, char: string): void {
  act(() => {
    editor.update(() => {
      const node = textNode();
      const end = node.getTextContentSize();
      node.select(end, end);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(char);
    }, { discrete: true });
  });
}

/** Reads the editor's text content for assertions after simulated typing. */
const textOf = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $getRoot().getTextContent());

beforeEach(() => { localStorage.clear(); });

describe('EditorToolbar', () => {
  it('does not re-render while typing inside one paragraph', () => {
    const editor = makeEditor();
    const counter = mountToolbar(editor);
    seed(editor);

    counter.commits = 0;
    for (const char of ['d', 'o', 'c']) type(editor, char);

    // The characters really landed — otherwise this test would pass by
    // measuring an editor that was never typed into.
    expect(textOf(editor)).toBe('hawkdoc');
    // Nothing the toolbar shows changed: same block type, same formatting,
    // same font. Re-rendering 846 lines of toolbar per keystroke is what this
    // guards against.
    expect(counter.commits).toBe(0);
  });

  it('still re-renders when the block type changes', () => {
    const editor = makeEditor();
    const counter = mountToolbar(editor);
    seed(editor);

    counter.commits = 0;
    act(() => {
      editor.update(() => {
        const paragraph = $getRoot().getFirstChild();
        const heading = $createHeadingNode('h1');
        heading.append($createTextNode('hawk'));
        paragraph?.replace(heading);
        heading.selectEnd();
      }, { discrete: true });
    });

    expect(counter.commits).toBeGreaterThan(0);
  });

  it('still re-renders when the selection picks up a format', () => {
    const editor = makeEditor();
    const counter = mountToolbar(editor);
    seed(editor);

    counter.commits = 0;
    act(() => {
      editor.update(() => {
        const node = textNode();
        node.select(0, node.getTextContentSize());
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.formatText('bold');
      }, { discrete: true });
    });

    expect(counter.commits).toBeGreaterThan(0);
  });
});
