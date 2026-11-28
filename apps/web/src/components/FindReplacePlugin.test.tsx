import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createEditor } from 'lexical';
import { FindReplacePlugin } from './FindReplacePlugin';

const editor = createEditor({ namespace: 'find-replace-test', onError: (e) => { throw e; } });
vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: () => [editor],
}));

function openPanel() {
  render(<FindReplacePlugin />);
  act(() => {
    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
  });
  return screen.getByPlaceholderText('Find');
}

describe('FindReplacePlugin Escape', () => {
  it('closes the panel on Escape', () => {
    const input = openPanel();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Find')).toBeNull();
  });

  it('keeps the panel open when Escape cancels an IME composition in the find field', () => {
    const input = openPanel();
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(screen.queryByPlaceholderText('Find')).not.toBeNull();
  });

  it('keeps the panel open on the Safari composition keydown (keyCode 229) in the replace field', () => {
    openPanel();
    fireEvent.keyDown(screen.getByPlaceholderText('Replace'), { key: 'Escape', keyCode: 229 });
    expect(screen.queryByPlaceholderText('Find')).not.toBeNull();
  });
});
