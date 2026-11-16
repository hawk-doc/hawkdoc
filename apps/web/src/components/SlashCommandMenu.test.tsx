import { act, render } from '@testing-library/react';
import {
  createEditor,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// jsdom does not implement scrollIntoView.
const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

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

  it('wraps around at both ends of the list', () => {
    const { editor, container } = setup('');
    const items = container.querySelectorAll('.slash-menu-item');
    const selected = () => container.querySelector('.slash-menu-item.selected');

    act(() => { editor.dispatchCommand(KEY_ARROW_UP_COMMAND, arrowEvent('ArrowUp')); });
    expect(selected()).toBe(items[items.length - 1]);

    act(() => { editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, arrowEvent('ArrowDown')); });
    expect(selected()).toBe(items[0]);
  });

  it('prevents the caret from moving while navigating', () => {
    const { editor } = setup('');
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    act(() => { editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, event); });
    expect(event.defaultPrevented).toBe(true);
  });

  it('scrolls the selected item into view', () => {
    const { editor, container } = setup('');
    scrollIntoView.mockClear();
    act(() => { editor.dispatchCommand(KEY_ARROW_UP_COMMAND, arrowEvent('ArrowUp')); });
    const items = container.querySelectorAll('.slash-menu-item');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts[scrollIntoView.mock.contexts.length - 1]).toBe(items[items.length - 1]);
  });
});

describe('SlashCommandMenu scroll handling', () => {
  it('stays open when its own list scrolls', () => {
    const { container, onClose } = setup('');
    const menu = container.querySelector('.slash-menu');
    act(() => { menu?.dispatchEvent(new Event('scroll')); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the page scrolls', () => {
    const { onClose } = setup('');
    act(() => { document.dispatchEvent(new Event('scroll')); });
    expect(onClose).toHaveBeenCalled();
  });
});
