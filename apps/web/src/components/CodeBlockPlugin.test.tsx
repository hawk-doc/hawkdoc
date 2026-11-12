import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CodeBlockPlugin';

const originalClipboard = navigator.clipboard;

function setClipboard(value: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setClipboard(originalClipboard);
  });

  const label = () => screen.getByRole('button').textContent?.trim();

  async function click() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
  }

  it('copies the code and shows confirmation, then resets', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton getCode={() => 'const a = 1;'} />);

    await click();
    expect(writeText).toHaveBeenCalledWith('const a = 1;');
    expect(label()).toBe('Copied!');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(label()).toBe('Copy');
  });

  it('keeps the confirmation for the full duration after a repeated click', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    render(<CopyButton getCode={() => 'x'} />);

    await click();
    act(() => { vi.advanceTimersByTime(1500); });
    await click();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(label()).toBe('Copied!');

    act(() => { vi.advanceTimersByTime(500); });
    expect(label()).toBe('Copy');
  });

  it('shows a failure when the clipboard write is rejected', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(<CopyButton getCode={() => 'x'} />);

    await click();
    expect(label()).toBe('Copy failed');
  });

  it('shows a failure when the clipboard API is unavailable', async () => {
    setClipboard(undefined);
    render(<CopyButton getCode={() => 'x'} />);

    await click();
    expect(label()).toBe('Copy failed');
  });

  it('clears the pending reset timer on unmount', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    const { unmount } = render(<CopyButton getCode={() => 'x'} />);

    await click();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
