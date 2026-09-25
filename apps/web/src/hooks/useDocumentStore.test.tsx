import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useDocumentStore } from './useDocumentStore';

const TOKEN = 'test-token';
const docRow = (id: string, title: string) => ({ id, title, updated_at: new Date().toISOString() });

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

const TRASH_KEY = ['documents', TOKEN, 'trash'];

const calls = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
const patches = () => calls().filter(([, init]) => init?.method === 'PATCH');

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = method === 'GET' && url.includes('/api/documents') && !url.includes('trash')
      ? [docRow('doc-1', 'First'), docRow('doc-2', 'Second')]
      : method === 'GET' ? [] : { id: 'doc-1', title: 'ok' };
    return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response;
  }) as unknown as typeof fetch;
});

const renderStore = async () => {
  const { client, wrapper } = harness();
  const view = renderHook(() => useDocumentStore(TOKEN), { wrapper });
  await waitFor(() => expect(view.result.current.docs).toHaveLength(2));
  return { ...view, client };
};

/** The trash list is fetched when opened; don't act until it has arrived */
const openTrash = async (view: Awaited<ReturnType<typeof renderStore>>) => {
  act(() => { view.result.current.setTrashOpen(true); });
  await waitFor(() => expect(view.client.getQueryState(TRASH_KEY)?.status).toBe('success'));
};

/** Mutations settle across several async steps; wait them out before asserting */
const settled = async (view: Awaited<ReturnType<typeof renderStore>>) => {
  await waitFor(() => expect(view.client.isMutating()).toBe(0));
};

describe('title sync', () => {
  it('sends one request after typing stops, not one per keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderStore();

    for (const title of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      act(() => { result.current.touch('doc-1', title); });
    }
    // the cache updates immediately; React Query batches the notification,
    // so wait for the render rather than asserting in the next statement
    await waitFor(() => expect(result.current.docs.find((d) => d.id === 'doc-1')?.title).toBe('Hello'));
    expect(patches()).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(patches()).toHaveLength(1);
    expect(JSON.parse(patches()[0][1].body as string)).toEqual({ title: 'Hello' });
  });

  it('persists a blank title as Untitled but keeps the field empty while typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderStore();

    act(() => { result.current.touch('doc-1', '   '); });
    await waitFor(() => expect(result.current.docs.find((d) => d.id === 'doc-1')?.title).toBe('   '));

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(JSON.parse(patches()[0][1].body as string)).toEqual({ title: 'Untitled' });
  });

  it('drops a pending title when the document is deleted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderStore();

    act(() => { result.current.touch('doc-1', 'Typed'); });
    act(() => { result.current.remove('doc-1'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(patches()).toHaveLength(0);
    expect(calls().some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });
});

describe('trash', () => {
  it('moves a document into the trash list straight away', async () => {
    const view = await renderStore();
    const { result } = view;
    await openTrash(view);
    expect(result.current.trashed).toHaveLength(0);

    act(() => { result.current.remove('doc-1'); });

    await waitFor(() => expect(result.current.docs.map((d) => d.id)).not.toContain('doc-1'));
    expect(result.current.trashed.map((d) => d.id)).toContain('doc-1');
  });

  it('puts the document back when the delete fails', async () => {
    const view = await renderStore();
    const { result } = view;
    await openTrash(view);
    act(() => { result.current.remove('doc-1'); });
    await waitFor(() => expect(result.current.trashed).toHaveLength(1));
    // let the trashing finish, so the 404 below belongs to the purge
    await settled(view);

    // the server has already lost it — purging 404s. The delay keeps the
    // optimistic removal on screen long enough to assert on it; without it
    // the rollback lands in the same tick.
    globalThis.fetch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as Response;
    }) as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => { result.current.purge('doc-1'); });

    // it leaves the trash optimistically...
    await waitFor(() => expect(result.current.trashed.map((d) => d.id)).not.toContain('doc-1'));
    // ...and the failed request puts it back
    await waitFor(() => expect(result.current.trashed.map((d) => d.id)).toContain('doc-1'));
    await settled(view);
  });
});
