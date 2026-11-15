import { act, render } from '@testing-library/react';
import {
  createEditor,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import { SlashCommandMenu } from './SlashCommandMenu';

const anchorRect = { top: 0, left: 0, bottom: 20, right: 0, width: 0, height: 20 } as DOMRect;

function arrowEvent(key: string) {
  return new KeyboardEvent('keydown', { key });
}

function setup(query: string) {
  const editor = createEditor({ onError: (e) => { throw e; } });
  const onClose = vi.fn();
  const utils = render(
    <SlashCommandMenu editor={editor} query={query} anchorRect={anchorRect} onClose={onClose} />,
  );
  return { editor, onClose, ...utils };
}

describe('SlashCommandMenu keyboard handling', () => {
  it('moves the selection with arrow keys while commands match', () => {
    const { editor, container } = setup('');
    const selected = () => container.querySelector('.slash-menu-item.selected')?.textContent;

    expect(selected()).toContain('Heading 1');
    let handled = false;
    act(() => { handled = editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, arrowEvent('ArrowDown')); });
    expect(handled).toBe(true);
    expect(selected()).toContain('Heading 2');

    act(() => { editor.dispatchCommand(KEY_ARROW_UP_COMMAND, arrowEvent('ArrowUp')); });
    expect(selected()).toContain('Heading 1');
  });

  it('closes on Escape while commands match', () => {
    const { editor, onClose } = setup('head');
    act(() => { editor.dispatchCommand(KEY_ESCAPE_COMMAND, arrowEvent('Escape')); });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing and lets keys reach the editor when no command matches', () => {
    const { editor, container, onClose } = setup('usr');
    expect(container.querySelector('.slash-menu')).toBeNull();

    expect(editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, arrowEvent('ArrowDown'))).toBe(false);
    expect(editor.dispatchCommand(KEY_ARROW_UP_COMMAND, arrowEvent('ArrowUp'))).toBe(false);
    expect(editor.dispatchCommand(KEY_ESCAPE_COMMAND, arrowEvent('Escape'))).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});
