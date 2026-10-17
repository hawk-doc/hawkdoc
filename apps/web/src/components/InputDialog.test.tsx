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
});
