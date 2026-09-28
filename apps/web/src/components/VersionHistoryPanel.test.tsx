import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { $getRoot, $createParagraphNode, $createTextNode, type SerializedEditorState } from 'lexical';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { recordLocalVersion, LOCAL_VERSION_INTERVAL_MS } from '../lib/versions/localVersions';
import { yjsUpdateFor } from '../test/collab';

const DOC = '11111111-1111-1111-1111-111111111111';
const TOKEN = 'signed-in-token';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The Yjs state the API would return for a version containing `text` */
function versionState(text: string): string {
  return bytesToBase64(
    yjsUpdateFor(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(text));
      $getRoot().append(paragraph);
    }),
  );
}

// A day in the past, so the heading is a date rather than "Today"
const DAY = new Date(Date.now() - 7 * 24 * 60 * 60_000);
const at = (hour: number) =>
  new Date(Date.UTC(DAY.getUTCFullYear(), DAY.getUTCMonth(), DAY.getUTCDate(), hour, 0)).toISOString();
const AT_10 = at(10);
const AT_11 = at(11);
// The heading the panel should print for that day, in this environment's locale
const DAY_HEADING = new Date(at(10)).toLocaleDateString(undefined, {
  day: 'numeric',
  month: 'long',
});

interface ServerHistory {
  versions: { id: string; createdAt: string; sizeBytes: number }[];
  content: Record<string, string>;
}

function mockApi(history: ServerHistory | { error: number }) {
  globalThis.fetch = vi.fn(async (url: string) => {
    if ('error' in history) {
      return { ok: false, status: history.error, json: async () => ({}), text: async () => '' } as Response;
    }
    const match = /\/versions\/(.+)$/.exec(url);
    const body = match
      ? { id: match[1], yjsState: history.content[match[1]!] }
      : history.versions;
    return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response;
  }) as unknown as typeof fetch;
}

/** A serialised editor state holding one paragraph, as the editor would report */
function currentDocument(text: string): SerializedEditorState {
  return {
    root: {
      type: 'root', version: 1, direction: null, format: '', indent: 0,
      children: [{
        type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
        children: [{ type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' }],
      }],
    },
  } as unknown as SerializedEditorState;
}

const TWO_VERSIONS = {
  versions: [
    { id: 'v2', createdAt: AT_11, sizeBytes: 30 },
    { id: 'v1', createdAt: AT_10, sizeBytes: 800 },
  ],
  content: { v1: versionState('the older text'), v2: versionState('the newest text') },
};

const changesTab = () => screen.getByRole('tab', { name: 'Changes' });
const insertions = () => [...document.querySelectorAll('ins')].map((node) => node.textContent?.trim());
const deletions = () => [...document.querySelectorAll('del')].map((node) => node.textContent?.trim());

function renderPanel(
  token: string | null,
  onRestore = vi.fn(),
  getCurrentState?: () => SerializedEditorState | null,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const view = render(
    createElement(VersionHistoryPanel, {
      docId: DOC,
      token,
      open: true,
      onClose: vi.fn(),
      onRestore,
      ...(getCurrentState ? { getCurrentState } : {}),
    }),
    { wrapper },
  );
  return { ...view, onRestore };
}

function versionButtons(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((button) => /^\d{1,2}[:.]\d{2}/.test(button.textContent ?? ''));
}

beforeEach(() => { localStorage.clear(); });

describe('version history panel', () => {
  it('lists versions under day headings and previews the newest', async () => {
    mockApi({
      versions: [
        { id: 'v2', createdAt: AT_11, sizeBytes: 30 },
        { id: 'v1', createdAt: AT_10, sizeBytes: 800 },
      ],
      content: { v1: versionState('the older text'), v2: versionState('the newest text') },
    });

    renderPanel(TOKEN);

    await waitFor(() => expect(versionButtons()).toHaveLength(2));
    expect(screen.getByText(DAY_HEADING)).toBeTruthy();
    expect(versionButtons()[0]!.textContent).toContain('latest');

    // The newest version is previewed without being asked for
    await waitFor(() => expect(screen.getByLabelText('Version preview').textContent)
      .toContain('the newest text'));
  });

  it('previews another version when it is picked', async () => {
    mockApi({
      versions: [
        { id: 'v2', createdAt: AT_11, sizeBytes: 30 },
        { id: 'v1', createdAt: AT_10, sizeBytes: 800 },
      ],
      content: { v1: versionState('the older text'), v2: versionState('the newest text') },
    });

    renderPanel(TOKEN);
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    fireEvent.click(versionButtons()[1]!);

    await waitFor(() => expect(screen.getByLabelText('Version preview').textContent)
      .toContain('the older text'));
  });

  it('confirms before restoring, then hands back that version', async () => {
    const onRestore = vi.fn();
    mockApi({
      versions: [
        { id: 'v2', createdAt: AT_11, sizeBytes: 30 },
        { id: 'v1', createdAt: AT_10, sizeBytes: 800 },
      ],
      content: { v1: versionState('the older text'), v2: versionState('the newest text') },
    });

    renderPanel(TOKEN, onRestore);
    await waitFor(() => expect(versionButtons()).toHaveLength(2));
    fireEvent.click(versionButtons()[1]!);
    await waitFor(() => expect(screen.getByLabelText('Version preview').textContent)
      .toContain('the older text'));

    fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));

    // Nothing is applied until the dialog is accepted
    const dialog = screen.getByRole('alertdialog');
    expect(onRestore).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/can undo/i)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    const state = onRestore.mock.calls[0]![0] as SerializedEditorState;
    expect(JSON.stringify(state)).toContain('the older text');
  });

  it('keeps the document when the restore dialog is dismissed', async () => {
    const onRestore = vi.fn();
    mockApi({
      versions: [{ id: 'v1', createdAt: AT_10, sizeBytes: 800 }],
      content: { v1: versionState('older') },
    });

    renderPanel(TOKEN, onRestore);
    await waitFor(() => expect(versionButtons()).toHaveLength(1));
    // Restoring is disabled until the version has been read
    await waitFor(() => expect(screen.getByLabelText('Version preview').textContent).toContain('older'));

    fireEvent.click(screen.getByRole('button', { name: /restore this version/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onRestore).not.toHaveBeenCalled();
  });

  it('explains an empty history instead of showing nothing', async () => {
    mockApi({ versions: [], content: {} });
    renderPanel(TOKEN);

    await waitFor(() => expect(screen.getByText(/No versions yet/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /restore this version/i })).toBeNull();
  });

  it('reports a failure to load the history', async () => {
    mockApi({ error: 500 });
    renderPanel(TOKEN);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/version history/i));
  });

  it('reads offline snapshots without touching the network', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const start = Date.now();
    recordLocalVersion(DOC, JSON.stringify({
      root: {
        children: [{
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'saved offline', type: 'text', version: 1 }],
          direction: null, format: '', indent: 0, type: 'paragraph', version: 1,
        }],
        direction: null, format: '', indent: 0, type: 'root', version: 1,
      },
    }), start - LOCAL_VERSION_INTERVAL_MS);

    renderPanel(null);

    await waitFor(() => expect(versionButtons()).toHaveLength(1));
    await waitFor(() => expect(screen.getByLabelText('Version preview').textContent)
      .toContain('saved offline'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('version history diff', () => {
  it('shows what changed in the selected version, word by word', async () => {
    mockApi(TWO_VERSIONS);
    renderPanel(TOKEN);
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    fireEvent.click(changesTab());

    // v2 is selected by default, so this compares it with v1
    await waitFor(() => expect(insertions()).toContain('newest'));
    expect(deletions()).toContain('older');
    expect(screen.getByText(/1 edited/)).toBeTruthy();
  });

  it('compares the version with the document as it stands', async () => {
    mockApi(TWO_VERSIONS);
    renderPanel(TOKEN, vi.fn(), () => currentDocument('the newest text with an ending'));
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    fireEvent.click(changesTab());
    await waitFor(() => expect(insertions().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'current' }));

    await waitFor(() => expect(insertions().join(' ')).toContain('with an ending'));
    expect(deletions()).toEqual([]);
  });

  it('says when a version has nothing before it', async () => {
    mockApi(TWO_VERSIONS);
    renderPanel(TOKEN, vi.fn(), () => currentDocument('anything'));
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    // The oldest version is the last row
    fireEvent.click(versionButtons()[1]!);
    fireEvent.click(changesTab());

    await waitFor(() => expect(screen.getByText(/earliest version kept/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Compare it with the document/ })).toBeTruthy();
  });

  it('reports two identical versions as unchanged rather than blank', async () => {
    mockApi({
      versions: [
        { id: 'v2', createdAt: AT_11, sizeBytes: 30 },
        { id: 'v1', createdAt: AT_10, sizeBytes: 30 },
      ],
      content: { v1: versionState('untouched'), v2: versionState('untouched') },
    });
    renderPanel(TOKEN);
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    fireEvent.click(changesTab());

    await waitFor(() => expect(screen.getByText('Nothing changed in this version.')).toBeTruthy());
  });

  it('offers no document comparison when the editor cannot provide one', async () => {
    mockApi(TWO_VERSIONS);
    renderPanel(TOKEN);
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    fireEvent.click(changesTab());

    await waitFor(() => expect(insertions().length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'current' })).toBeNull();
  });

  it('keeps showing the version itself on the Document tab', async () => {
    mockApi(TWO_VERSIONS);
    renderPanel(TOKEN);
    await waitFor(() => expect(versionButtons()).toHaveLength(2));

    fireEvent.click(changesTab());
    await waitFor(() => expect(insertions().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('tab', { name: 'Document' }));

    await waitFor(() => expect(screen.getByLabelText('Version preview').textContent)
      .toContain('the newest text'));
  });
});
