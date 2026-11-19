import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical';
import { LinkNode } from '@lexical/link';
import { BubbleMenu } from './BubbleMenu';

let rect = { top: 300, left: 100, width: 80, height: 20 };

function mockDomSelection() {
  const range = { getBoundingClientRect: () => ({ ...rect }) } as unknown as Range;
  vi.spyOn(window, 'getSelection').mockReturnValue({
    rangeCount: 1,
    getRangeAt: () => range,
  } as unknown as Selection);
}

function selectText(editor: LexicalEditor) {
  editor.update(
    () => {
      const text = $createTextNode('hello world');
      $getRoot().clear().append($createParagraphNode().append(text));
      text.select(0, 5);
    },
    { discrete: true },
  );
}

const menu = () => document.body.querySelector<HTMLDivElement>('div.fixed');

describe('BubbleMenu', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    rect = { top: 300, left: 100, width: 80, height: 20 };
    mockDomSelection();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    editor = createEditor({ nodes: [LinkNode], onError: (e) => { throw e; } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appears above a non-collapsed selection', () => {
    render(<BubbleMenu editor={editor} />);
    act(() => selectText(editor));
    expect(menu()?.style.top).toBe('252px');
    expect(menu()?.style.left).toBe('140px');
  });

  it('follows the selection when an ancestor scrolls', () => {
    const { container } = render(<BubbleMenu editor={editor} />);
    act(() => selectText(editor));

    rect = { ...rect, top: 150 };
    act(() => {
      container.dispatchEvent(new Event('scroll'));
    });
    expect(menu()?.style.top).toBe('102px');
  });

  it('follows the selection when the window resizes', () => {
    render(<BubbleMenu editor={editor} />);
    act(() => selectText(editor));

    rect = { ...rect, left: 300 };
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(menu()?.style.left).toBe('340px');
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(<BubbleMenu editor={editor} />);
    act(() => selectText(editor));
    unmount();

    const raf = vi.mocked(window.requestAnimationFrame);
    raf.mockClear();
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(raf).not.toHaveBeenCalled();
  });
});
