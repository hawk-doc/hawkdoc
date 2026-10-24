import { describe, it, expect, vi } from 'vitest';
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
