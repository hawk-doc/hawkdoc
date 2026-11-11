import { beforeAll, describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FindReplacePlugin } from './FindReplacePlugin';
import { indexAfterReplace, type Match } from '../lib/findReplace';

const hit = (nodeKey: string, start: number, matchIndex: number): Match =>
  ({ nodeKey, start, end: start + 1, matchIndex });

describe('indexAfterReplace', () => {
  it('moves past the replaced hit in the same node', () => {
    const found = [hit('a', 0, 0), hit('a', 2, 1), hit('a', 4, 2)];
    expect(indexAfterReplace(found, { nodeKey: 'a', offset: 1, hitsInEarlierNodes: 0 })).toBe(1);
  });

  it('counts hits in earlier nodes and wraps at the end', () => {
    const found = [hit('a', 0, 0), hit('b', 0, 1), hit('b', 3, 2)];
    expect(indexAfterReplace(found, { nodeKey: 'b', offset: 1, hitsInEarlierNodes: 1 })).toBe(2);
    expect(indexAfterReplace(found, { nodeKey: 'b', offset: 4, hitsInEarlierNodes: 1 })).toBe(0);
  });

  it('is 0 when nothing is left', () => {
    expect(indexAfterReplace([], { nodeKey: 'a', offset: 1, hitsInEarlierNodes: 0 })).toBe(0);
  });
});

let editorRef: LexicalEditor | null = null;
function Capture() {
  [editorRef] = useLexicalComposerContext();
  return null;
}

function text(): string {
  return editorRef!.getEditorState().read(() => $getRoot().getTextContent());
}

describe('FindReplacePlugin', () => {
  // jsdom has no layout, so moving to a hit can't scroll
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => undefined;
  });

  it('Replace moves on even when the replacement still matches', async () => {
    render(
      <LexicalComposer
        initialConfig={{
          namespace: 'test',
          onError: (e) => { throw e; },
          editorState: () => {
            $getRoot().append($createParagraphNode().append($createTextNode('a a a')));
          },
        }}
      >
        <RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
        <Capture />
        <FindReplacePlugin />
      </LexicalComposer>,
    );

    await act(async () => {
      fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    });
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('Replace'), { target: { value: 'A' } });

    const replace = screen.getByRole('button', { name: 'Replace' });
    for (let i = 0; i < 3; i++) {
      await act(async () => { fireEvent.click(replace); });
    }
    expect(text()).toBe('A A A');
  });
});
