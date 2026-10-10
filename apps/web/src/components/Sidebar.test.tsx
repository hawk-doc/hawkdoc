import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { DocMeta } from '../interfaces';

const doc = (id: string, title: string, starred = false): DocMeta => ({
  id,
  title,
  updatedAt: Date.now(),
  ...(starred ? { starred: true } : {}),
});

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    docs: [doc('d1', 'Budget'), doc('d2', 'Holiday')],
    activeId: 'd1',
    onActivate: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    starred: [] as DocMeta[],
    onToggleStar: vi.fn(),
    starredHasMore: false,
    onLoadMoreStarred: vi.fn(),
    isLoadingMoreStarred: false,
    trashed: [] as DocMeta[],
    trashOpen: false,
    onTrashOpenChange: vi.fn(),
    onRestore: vi.fn(),
    onPurge: vi.fn(),
    onEmptyTrash: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    total: 2,
    hasMore: false,
    onLoadMore: vi.fn(),
    isLoadingMore: false,
    trashHasMore: false,
    onLoadMoreTrash: vi.fn(),
    isLoadingMoreTrash: false,
    open: true,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return props;
}

/** The rows, in the order the sidebar lists them */
const rowTitles = () =>
  [...document.querySelectorAll('.sidebar-item')].map((row) => row.textContent?.trim());

describe('Sidebar starring', () => {
  it('stars an unstarred document', () => {
    const props = renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Star Budget' }));
    expect(props.onToggleStar).toHaveBeenCalledWith('d1', true);
  });

  it('unstars one that is already starred', () => {
    const starred = doc('d1', 'Budget', true);
    const props = renderSidebar({ docs: [starred, doc('d2', 'Holiday')], starred: [starred] });

    // Two copies are listed — the starred group and the full list
    const buttons = screen.getAllByRole('button', { name: 'Remove star from Budget' });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveProperty('ariaPressed', 'true');

    fireEvent.click(buttons[0]!);
    expect(props.onToggleStar).toHaveBeenCalledWith('d1', false);
  });

  it('lists the starred documents above the rest, under their own heading', () => {
    const starred = doc('d2', 'Holiday', true);
    renderSidebar({ docs: [doc('d1', 'Budget'), starred], starred: [starred] });

    expect(screen.getByText('Starred')).toBeTruthy();
    expect(screen.getByText('All documents')).toBeTruthy();
    // Starred first, then the whole list — the starred one appears in both
    expect(rowTitles()).toEqual(['Holiday', 'Budget', 'Holiday']);
  });

  it('hides the starred group while searching', () => {
    const starred = doc('d2', 'Holiday', true);
    renderSidebar({ docs: [starred], starred: [starred], search: 'hol' });

    // The search already covers starred documents; two result sets for one
    // query reads as a bug
    expect(screen.queryByText('Starred')).toBeNull();
    expect(rowTitles()).toEqual(['Holiday']);
  });

  it('renames only the copy that was double-clicked', () => {
    const starred = doc('d1', 'Budget', true);
    renderSidebar({ docs: [starred], starred: [starred] });

    const rows = document.querySelectorAll('.sidebar-item');
    fireEvent.doubleClick(rows[0]!);

    // One input, in the group that was clicked — not both copies at once
    expect(document.querySelectorAll('.sidebar-rename-input')).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByRole('textbox')).toBeTruthy();
  });

  it('offers more starred documents when there are more to load', () => {
    const starred = doc('d1', 'Budget', true);
    const props = renderSidebar({
      docs: [starred], starred: [starred], starredHasMore: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show more starred' }));
    expect(props.onLoadMoreStarred).toHaveBeenCalled();
  });

  it('shows no starred heading when nothing is starred', () => {
    renderSidebar();
    expect(screen.queryByText('Starred')).toBeNull();
    expect(rowTitles()).toEqual(['Budget', 'Holiday']);
  });
});
