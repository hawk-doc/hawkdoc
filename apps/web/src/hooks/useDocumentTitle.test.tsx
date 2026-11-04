import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'HawkDoc — Zero-lag document editor';
  });

  it('puts the document title in the tab title', () => {
    renderHook(() => useDocumentTitle('Meeting notes'));
    expect(document.title).toBe('Meeting notes — HawkDoc');
  });

  it('follows title changes', () => {
    const { rerender } = renderHook(({ t }) => useDocumentTitle(t), { initialProps: { t: 'A' } });
    rerender({ t: 'B' });
    expect(document.title).toBe('B — HawkDoc');
  });

  it('keeps the default for a missing or blank title', () => {
    renderHook(() => useDocumentTitle('   '));
    expect(document.title).toBe('HawkDoc — Zero-lag document editor');
  });

  it('restores the previous title on unmount', () => {
    const { unmount } = renderHook(() => useDocumentTitle('Draft'));
    unmount();
    expect(document.title).toBe('HawkDoc — Zero-lag document editor');
  });
});
