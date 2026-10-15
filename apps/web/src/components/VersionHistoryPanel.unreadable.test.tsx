import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { SerializedEditorState } from 'lexical';
import { VersionHistoryPanel } from './VersionHistoryPanel';

// A version whose content names a node type the editor does not know
const BROKEN = {
  root: {
    type: 'root', version: 1, direction: null, format: '', indent: 0,
    children: [{ type: 'no-such-node', version: 1 }],
  },
} as unknown as SerializedEditorState;

vi.mock('../hooks/useDocumentVersions', () => ({
  useDocumentVersions: () => ({
    versions: [{ id: 'v1', createdAt: new Date().toISOString(), sizeBytes: 10 }],
    isLoading: false, error: null,
    selectedId: 'v1', select: vi.fn(),
    preview: BROKEN, isPreviewLoading: false, previewError: null,
    previousId: null, previous: null, isPreviousLoading: false, previousError: null,
  }),
}));

describe('version history panel, unreadable version', () => {
  it('says so and blocks the restore instead of showing an empty version', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <VersionHistoryPanel docId="d" token="t" open onClose={vi.fn()} onRestore={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be displayed/i));
    expect((screen.getByRole('button', { name: /restore this version/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
