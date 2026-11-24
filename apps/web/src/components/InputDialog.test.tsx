import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputDialog } from './InputDialog';

describe('InputDialog', () => {
  it('names the field after the dialog, so it is not just "edit text"', () => {
    render(<InputDialog title="Insert link" placeholder="https://…" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Insert link')).toBeTruthy();
  });

  it('shows a message when one is given, and none when not', () => {
    const { unmount } = render(
      <InputDialog title="Name it" message="A named version is kept." placeholder="x" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('A named version is kept.')).toBeTruthy();
    unmount();

    render(<InputDialog title="Name it" placeholder="x" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('A named version is kept.')).toBeNull();
  });

  it('refuses an empty value by default', () => {
    const onConfirm = vi.fn();
    render(<InputDialog title="Insert link" placeholder="x" confirmLabel="Insert" onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('accepts an empty value when asked to, which is how a value is cleared', () => {
    const onConfirm = vi.fn();
    render(
      <InputDialog
        title="Name this version"
        placeholder="x"
        defaultValue="Old name"
        confirmLabel="Save name"
        allowEmpty
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name this version'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('trims what it hands back', () => {
    const onConfirm = vi.fn();
    render(<InputDialog title="Name" placeholder="x" confirmLabel="Go" onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  padded  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onConfirm).toHaveBeenCalledWith('padded');
  });

  it('ignores Enter and Escape while an IME is composing text', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<InputDialog title="Variable name" placeholder="x" onConfirm={onConfirm} onCancel={onCancel} />);
    const input = screen.getByLabelText('Variable name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'へんすう' } });

    // Enter/Escape here confirm or cancel the composition, not the dialog
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    // Safari's composition-ending keydown carries only keyCode 229
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('へんすう');
  });

  it('keeps Tab inside the dialog, wrapping both ways', () => {
    render(<InputDialog title="Insert link" placeholder="x" confirmLabel="Insert" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText('Insert link');
    const insert = screen.getByRole('button', { name: 'Insert' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(input);

    // Shift+Tab from the first focusable (Close) goes to the last button
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(insert);

    // Tab from the last button comes back to Close
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('pulls focus back in when Tab is pressed from outside the dialog', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    render(<InputDialog title="Name" placeholder="x" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    outside.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    outside.remove();
  });

  it('hands focus back to what had it when the dialog closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<InputDialog title="Name" placeholder="x" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('is marked as a modal dialog with dark-mode styles', () => {
    render(<InputDialog title="Name" placeholder="x" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toContain('dark:bg-[#2d2f31]');
    expect(screen.getByLabelText('Name').className).toContain('dark:bg-[#202124]');
  });

  it('cancels on Escape without also closing the panel it opened over', () => {
    const panelClose = vi.fn();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') panelClose(); };
    document.addEventListener('keydown', handler);
    try {
      const onCancel = vi.fn();
      render(<InputDialog title="Name this version" placeholder="x" onConfirm={vi.fn()} onCancel={onCancel} />);
      fireEvent.keyDown(screen.getByLabelText('Name this version'), { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(panelClose).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', handler);
    }
  });
});
