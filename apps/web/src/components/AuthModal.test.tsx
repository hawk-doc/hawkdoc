import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthModal } from './AuthModal';

const register = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), register }),
}));

function openRegister() {
  render(<AuthModal onClose={vi.fn()} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign up' })[0]);
}

describe('AuthModal password length', () => {
  it('warns and blocks submit when a new password exceeds 72 bytes', () => {
    register.mockClear();
    openRegister();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'j@x.test' } });
    // 40 two-byte characters = 80 bytes but only 40 characters
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'é'.repeat(40) } });

    expect(screen.getByRole('alert').textContent).toMatch(/72 bytes/);
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    expect(register).not.toHaveBeenCalled();
  });

  it('shows no warning for a password within the limit', () => {
    openRegister();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a'.repeat(72) } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AuthModal Escape', () => {
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

  it('closes on Escape without also closing the panel it opened over', () => {
    const panelClose = panelUnderneath();
    const onClose = vi.fn();
    render(<AuthModal onClose={onClose} />);

    fireEvent.keyDown(screen.getByLabelText('Email'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(panelClose).not.toHaveBeenCalled();
  });

  it('stops intercepting Escape once it is closed', () => {
    const panelClose = panelUnderneath();
    const { unmount } = render(<AuthModal onClose={vi.fn()} />);
    unmount();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(panelClose).toHaveBeenCalledTimes(1);
  });
});
