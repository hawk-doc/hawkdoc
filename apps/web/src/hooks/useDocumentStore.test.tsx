import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useDocumentStore } from './useDocumentStore';
import { SEARCH_DEBOUNCE_MS } from '../constants/autosave';

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
    // The document list is paged, so the client reads the total and the next
    // page's cursor out of the response headers
    const headers = new Headers(
      method === 'GET' && Array.isArray(body) ? { 'X-Total-Count': String(body.length) } : {},
    );
    return { ok: true, status: 200, headers, json: async () => body, text: async () => '' } as Response;
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

// ─── Paging, searching and duplicating ───────────────────────────────────────

/** A server holding `titles`, paging and searching them the way the API does */
function serveDocuments(titles: string[], pageSize = 2) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push(url);
    const parsed = new URL(url, 'http://api.test');

    if ((init.method ?? 'GET') !== 'GET') {
      const copy = { id: `copy-${calls.length}`, title: 'Copy of First', updated_at: new Date().toISOString() };
      return { ok: true, status: 200, headers: new Headers(), json: async () => copy, text: async () => '' } as Response;
    }
    if (parsed.searchParams.get('trash') === 'true') {
      return { ok: true, status: 200, headers: new Headers(), json: async () => [], text: async () => '' } as Response;
    }

    const q = parsed.searchParams.get('q');
    const matching = q
      ? titles.filter((title) => title.toLowerCase().includes(q.toLowerCase()))
      : titles;
    const cursor = parsed.searchParams.get('cursor');
    const start = cursor ? matching.indexOf(cursor) + 1 : 0;
    const page = matching.slice(start, start + pageSize);
    const last = page[page.length - 1];

    const headers = new Headers();
    if (!cursor) headers.set('X-Total-Count', String(matching.length));
    if (last && start + page.length < matching.length) {
      headers.set('Link', `</api/documents?cursor=${encodeURIComponent(last)}>; rel="next"`);
    }

    const body = page.map((title) => ({ id: title, title, updated_at: new Date().toISOString() }));
    return { ok: true, status: 200, headers, json: async () => body, text: async () => '' } as Response;
  }) as unknown as typeof fetch;
  return { calls };
}

const renderWith = async (expected: number) => {
  const { client, wrapper } = harness();
  const view = renderHook(() => useDocumentStore(TOKEN), { wrapper });
  await waitFor(() => expect(view.result.current.docs).toHaveLength(expected));
  return { ...view, client };
};

describe('paging the document list', () => {
  it('loads one page and says how many there are in total', async () => {
    serveDocuments(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
    const { result } = await renderWith(2);

    expect(result.current.docs.map((d) => d.title)).toEqual(['First', 'Second']);
    expect(result.current.total).toBe(5);
    expect(result.current.hasMore).toBe(true);
  });

  it('appends the next page without repeating anything', async () => {
    serveDocuments(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
    const view = await renderWith(2);

    act(() => { view.result.current.loadMore(); });
    await waitFor(() => expect(view.result.current.docs).toHaveLength(4));

    act(() => { view.result.current.loadMore(); });
    await waitFor(() => expect(view.result.current.hasMore).toBe(false));

    const titles = view.result.current.docs.map((d) => d.title);
    expect(titles).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
    expect(new Set(titles).size).toBe(5);
  });

  it('keeps the open document when it sits beyond the loaded pages', async () => {
    // The stored active document may be far down a long list. Falling back to
    // the top of the list would switch document behind the user's back.
    localStorage.setItem('hawkdoc-active-doc', 'Fifth');
    serveDocuments(['First', 'Second', 'Third', 'Fourth', 'Fifth']);

    const { result } = await renderWith(2);

    expect(result.current.activeId).toBe('Fifth');
  });
});

describe('searching documents', () => {
  it('asks the server once typing stops, not once per keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = serveDocuments(['Quarterly report', 'Shopping list']);
    const view = await renderWith(2);
    const before = calls.length;

    for (const value of ['q', 'qu', 'qua']) {
      act(() => { view.result.current.setSearch(value); });
    }
    // The box shows every keystroke; the query waits
    expect(view.result.current.search).toBe('qua');
    expect(calls.length).toBe(before);

    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS); });
    await waitFor(() => expect(view.result.current.docs).toHaveLength(1));

    expect(calls.filter((url) => url.includes('q=qua'))).toHaveLength(1);
    expect(view.result.current.docs[0]!.title).toBe('Quarterly report');
  });

  it('does not change which document is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveDocuments(['First', 'Second', 'Third']);
    const view = await renderWith(2);
    act(() => { view.result.current.activate('Second'); });
    expect(view.result.current.activeId).toBe('Second');

    act(() => { view.result.current.setSearch('Third'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS); });
    await waitFor(() => expect(view.result.current.docs.map((d) => d.title)).toEqual(['Third']));

    // Searching is a view over the list, not a change of what you are editing
    expect(view.result.current.activeId).toBe('Second');
  });
});

describe('duplicating a document', () => {
  it('shows the copy straight away and opens it', async () => {
    serveDocuments(['First', 'Second']);
    const view = await renderWith(2);

    act(() => { view.result.current.duplicate('First'); });

    await waitFor(() => expect(view.result.current.docs.map((d) => d.title)).toContain('Copy of First'));
    expect(view.result.current.docs[0]!.title).toBe('Copy of First');
    await waitFor(() => expect(view.result.current.activeId).toBe(view.result.current.docs[0]!.id));
  });
});

describe('the document you had open', () => {
  it('is the one that opens again, not whichever was edited last', async () => {
    localStorage.setItem('hawkdoc-active-doc', 'Second');
    serveDocuments(['First', 'Second', 'Third'], 50);

    const { result } = await renderWith(3);

    expect(result.current.activeId).toBe('Second');
  });

  it('falls back to the top of the list when that document is gone', async () => {
    localStorage.setItem('hawkdoc-active-doc', 'Deleted elsewhere');
    serveDocuments(['First', 'Second'], 50);

    const { result } = await renderWith(2);

    expect(result.current.activeId).toBe('First');
  });
});

describe('render stability', () => {
  it('hands out the same callbacks between renders', async () => {
    const view = await renderStore();
    const before = view.result.current;

    view.rerender();
    const after = view.result.current;

    // Every one of these is a prop on the sidebar or the editor. Rebuilding
    // them per render means a changed prop on everything downstream whenever
    // anything in the app re-renders — including a pagehide listener that was
    // torn down and registered again each time.
    const callbacks = [
      'loadMore', 'loadMoreTrash', 'create', 'remove', 'restore', 'purge',
      'duplicate', 'emptyTrash', 'activate', 'touch', 'rename',
      'setSearch', 'setTrashOpen', 'loadMoreStarred', 'toggleStar',
    ] as const;
    for (const name of callbacks) {
      expect(after[name], name).toBe(before[name]);
    }
  });
});

describe('starring', () => {
  /** Serves a two-document list, the starred slice, and records every PATCH */
  function mockStarApi(options: { failPatch?: boolean } = {}) {
    const starred = new Set<string>();
    // A failing PATCH hangs until the test lets it answer, so the optimistic
    // star can be seen on screen before the rollback takes it away again.
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = () => { resolve(); }; });
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const fail = () =>
        ({ ok: false, status: 500, headers: new Headers(), json: async () => ({}), text: async () => '' }) as Response;

      if (method === 'PATCH') {
        if (options.failPatch) {
          await held;
          return fail();
        }
        const id = /documents\/([^/?]+)/.exec(url)?.[1] ?? '';
        const body = JSON.parse(String(init.body ?? '{}')) as { starred?: boolean };
        if (body.starred) starred.add(id); else starred.delete(id);
        return {
          ok: true, status: 200, headers: new Headers(),
          json: async () => ({ id, title: 'ok', starred: body.starred, updated_at: new Date(0).toISOString() }),
          text: async () => '',
        } as Response;
      }
      if (method === 'DELETE') {
        return { ok: true, status: 204, headers: new Headers(), json: async () => ({}), text: async () => '' } as Response;
      }

      const all = [docRow('doc-1', 'First'), docRow('doc-2', 'Second')];
      const body = url.includes('trash=true')
        ? []
        : url.includes('starred=true')
          ? all.filter((doc) => starred.has(doc.id)).map((doc) => ({ ...doc, starred: true }))
          : all.map((doc) => ({ ...doc, starred: starred.has(doc.id) }));
      return {
        ok: true, status: 200,
        headers: new Headers({ 'X-Total-Count': String(body.length) }),
        json: async () => body, text: async () => '',
      } as Response;
    }) as unknown as typeof fetch;

    return { release: () => { release(); } };
  }

  const render = async () => {
    const { client, wrapper } = harness();
    const view = renderHook(() => useDocumentStore(TOKEN), { wrapper });
    await waitFor(() => expect(view.result.current.docs).toHaveLength(2));
    return { ...view, client };
  };

  /** GETs of the main list — the one that must not be refetched to show a star */
  const listLoads = () =>
    (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url, init]) => (init?.method ?? 'GET') === 'GET'
        && String(url).includes('/api/documents')
        && !String(url).includes('starred=true')
        && !String(url).includes('trash=true'));

  it('fills the star without refetching the list, and keeps the document in it', async () => {
    mockStarApi();
    const view = await render();
    const loadsBefore = listLoads().length;

    await act(async () => { view.result.current.toggleStar('doc-1', true); });

    // The flag is written into the cached list, so the row's star fills
    // without waiting for — or asking for — the list again
    await waitFor(() =>
      expect(view.result.current.docs.find((d) => d.id === 'doc-1')?.starred).toBe(true));
    expect(listLoads()).toHaveLength(loadsBefore);
    // Starring marks a document; it does not move it out of the main list
    expect(view.result.current.docs).toHaveLength(2);
    // The starred list itself comes from the server, which owns its order
    await waitFor(() => expect(view.result.current.starred.map((d) => d.id)).toEqual(['doc-1']));
  });

  it('unstars again', async () => {
    mockStarApi();
    const view = await render();

    await act(async () => { view.result.current.toggleStar('doc-2', true); });
    await waitFor(() => expect(view.result.current.starred).toHaveLength(1));

    await act(async () => { view.result.current.toggleStar('doc-2', false); });
    await waitFor(() => expect(view.result.current.starred).toHaveLength(0));
    expect(view.result.current.docs.find((d) => d.id === 'doc-2')?.starred).toBeFalsy();
  });

  it('puts the star back when the write fails', async () => {
    const server = mockStarApi({ failPatch: true });
    const view = await render();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadsBefore = listLoads().length;

    const star = (): boolean | undefined =>
      view.result.current.docs.find((d) => d.id === 'doc-1')?.starred;

    act(() => { view.result.current.toggleStar('doc-1', true); });
    // Filled first, while the write is still in flight
    await waitFor(() => expect(star()).toBe(true));

    await act(async () => { server.release(); });

    await waitFor(() => expect(star()).toBeFalsy());
    // It can only have come back off by being rolled back: nothing refetched
    // the list to find out the write hadn't landed.
    expect(listLoads()).toHaveLength(loadsBefore);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it.each([true, false])('drops a trashed document out of the starred list when present in the main cache: %s', async (inMainCache) => {
    mockStarApi();
    const view = await render();

    await act(async () => { view.result.current.toggleStar('doc-1', true); });
    await waitFor(() => expect(view.result.current.starred).toHaveLength(1));

    if (!inMainCache) {
      act(() => {
        view.client.setQueryData(['documents', TOKEN, 'list', ''], {
          pages: [{ docs: [view.result.current.docs[1]], total: 2, nextCursor: null }],
          pageParams: [null],
        });
      });
      await waitFor(() => expect(view.result.current.docs.map((d) => d.id)).toEqual(['doc-2']));
    }

    await act(async () => { view.result.current.remove('doc-1'); });

    // A document in the trash is out of reach, starred or not
    await waitFor(() => expect(view.result.current.starred).toHaveLength(0));
  });
});
