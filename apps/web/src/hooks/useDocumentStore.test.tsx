import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useDocumentStore } from './useDocumentStore';

const TOKEN = 'test-token';
const docRow = (id: string, title: string) => ({ id, title, updated_at: new Date().toISOString() });

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

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
  const view = renderHook(() => useDocumentStore(TOKEN), { wrapper: wrapper() });
  await waitFor(() => expect(view.result.current.docs).toHaveLength(2));
  return view;
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
    const { result } = await renderStore();
    act(() => { result.current.setTrashOpen(true); });
    await waitFor(() => expect(result.current.trashOpen).toBe(true));

    act(() => { result.current.remove('doc-1'); });

    await waitFor(() => expect(result.current.docs.map((d) => d.id)).not.toContain('doc-1'));
    expect(result.current.trashed.map((d) => d.id)).toContain('doc-1');
  });

  it('puts the document back when the delete fails', async () => {
    const { result } = await renderStore();
    act(() => { result.current.setTrashOpen(true); });
    await waitFor(() => expect(result.current.trashOpen).toBe(true));
    act(() => { result.current.remove('doc-1'); });
    await waitFor(() => expect(result.current.trashed).toHaveLength(1));

    // the server has already lost it — purging 404s
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }) as Response) as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => { result.current.purge('doc-1'); });
    await waitFor(() => expect(result.current.trashed.map((d) => d.id)).toContain('doc-1'));
  });
});
