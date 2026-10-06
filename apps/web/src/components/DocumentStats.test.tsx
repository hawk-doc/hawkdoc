import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  createEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type LexicalEditor,
} from 'lexical';
import { DocumentStats } from './DocumentStats';
import { EDITOR_NODES } from '../constants/editor';

function makeEditor(): LexicalEditor {
  return createEditor({ nodes: EDITOR_NODES, onError: (error: Error) => { throw error; } });
}

function write(editor: LexicalEditor, text: string): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    root.append($createParagraphNode().append($createTextNode(text)));
  }, { discrete: true });
}

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('DocumentStats', () => {
  it('counts the words already in the document', () => {
    const editor = makeEditor();
    write(editor, 'three little words');
    render(<DocumentStats editor={editor} />);
    expect(screen.getByText(/3 words/)).toBeTruthy();
  });

  it('holds the count steady until typing pauses', () => {
    const editor = makeEditor();
    render(<DocumentStats editor={editor} />);

    write(editor, 'one');
    write(editor, 'one two');
    write(editor, 'one two three');
    // Recounting walks the whole document, so it waits for the typing to stop
    expect(screen.getByText(/0 words/)).toBeTruthy();

    tick(400);
    expect(screen.getByText(/3 words/)).toBeTruthy();
  });

  it('reads an empty document as no words and no reading time', () => {
    const editor = makeEditor();
    render(<DocumentStats editor={editor} />);
    expect(screen.getByText('0 words')).toBeTruthy();
    expect(screen.queryByText(/read/)).toBeNull();
  });

  it('says one word in the singular', () => {
    const editor = makeEditor();
    write(editor, 'solo');
    render(<DocumentStats editor={editor} />);
    expect(screen.getByText(/1 word(?!s)/)).toBeTruthy();
  });

  it('shows a reading time once there is something to read', () => {
    const editor = makeEditor();
    write(editor, Array.from({ length: 450 }, (_, i) => `w${i}`).join(' '));
    render(<DocumentStats editor={editor} />);
    // 450 words at 200 a minute rounds up to 3
    expect(screen.getByText(/3 min read/)).toBeTruthy();
  });

  it('ignores an editor that has not mounted yet', () => {
    render(<DocumentStats editor={null} />);
    expect(screen.getByText('0 words')).toBeTruthy();
  });
});
