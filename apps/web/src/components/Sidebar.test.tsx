import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const props: ComponentProps<typeof Sidebar> = {
    docs: [{ id: 'doc-1', title: 'Untitled', updatedAt: Date.now() }],
    activeId: 'doc-1',
    onActivate: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    trashed: [], trashOpen: false, onTrashOpenChange: vi.fn(),
    onRestore: vi.fn(), onPurge: vi.fn(), onEmptyTrash: vi.fn(),
    search: '', onSearchChange: vi.fn(), total: 1, hasMore: false,
    onLoadMore: vi.fn(), isLoadingMore: false,
    trashHasMore: false, onLoadMoreTrash: vi.fn(), isLoadingMoreTrash: false,
    open: true, onClose: vi.fn(),
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe('sidebar empty state', () => {
  it.each(['Untitled', ''])('keeps the %j document and Show more visible while more pages remain', (title) => {
    const props = renderSidebar({
      docs: [{ id: 'doc-1', title, updatedAt: Date.now() }], hasMore: true, total: 2,
    });

    expect(screen.queryByText('No documents yet')).toBeNull();
    fireEvent.click(screen.getByText('Untitled'));
    expect(props.onActivate).toHaveBeenCalledWith('doc-1');
    fireEvent.click(screen.getByRole('button', { name: 'Show more (1 left)' }));
    expect(props.onLoadMore).toHaveBeenCalledOnce();
  });

  it.each(['Untitled', ''])('shows the empty state for a lone %j document when pagination is complete', (title) => {
    renderSidebar({ docs: [{ id: 'doc-1', title, updatedAt: Date.now() }] });

    expect(screen.getByText('No documents yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('keeps a matching Untitled document visible during search', () => {
    renderSidebar({ search: 'Untitled' });

    expect(screen.getByText('Untitled')).toBeTruthy();
    expect(screen.queryByText('No documents yet')).toBeNull();
  });

  it('keeps a named document visible when pagination is complete', () => {
    renderSidebar({ docs: [{ id: 'doc-1', title: 'Draft', updatedAt: Date.now() }] });

    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.queryByText('No documents yet')).toBeNull();
  });
});
