import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  const listeners: Array<(e: KeyboardEvent) => void> = [];
  afterEach(() => {
    listeners.splice(0).forEach((l) => document.removeEventListener('keydown', l));
  });

  /** A panel underneath that closes on Escape, the way VersionHistoryPanel and Sidebar do */
  const panelUnderneath = () => {
    const onClose = vi.fn();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    listeners.push(handler);
    return onClose;
  };

  it('confirms and cancels from its buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Restore?" message="m" confirmLabel="Restore" onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape without also closing the panel it opened over', () => {
    const panelClose = panelUnderneath();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Restore?" message="m" onConfirm={vi.fn()} onCancel={onCancel} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Confirm' }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(panelClose).not.toHaveBeenCalled();
  });

  it('stops intercepting Escape once it is closed', () => {
    const panelClose = panelUnderneath();
    const { unmount } = render(<ConfirmDialog title="Restore?" message="m" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    unmount();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(panelClose).toHaveBeenCalledTimes(1);
  });
});
