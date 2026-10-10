import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { ACTIVE_DOC_KEY, DEBOUNCE_MS, SEARCH_DEBOUNCE_MS } from '../constants/autosave';
import {
  fetchDocuments,
  fetchTrashedDocuments,
  createDocument,
  duplicateDocument,
  renameDocument,
  removeDocument,
  setStarred,
  restoreDocument,
  purgeDocument,
  emptyTrash,
  type DocumentPage,
} from '../lib/documentApi';
import type { DocMeta } from '../interfaces';

/**
 * The document list arrives a page at a time, so the cache holds pages rather
 * than one array. These keep that shape out of the mutations, which only ever
 * want to add, change or drop a document wherever it happens to sit.
 */
type DocsCache = InfiniteData<DocumentPage> | undefined;

function flatten(cache: DocsCache): DocMeta[] {
  return cache?.pages.flatMap((page) => page.docs) ?? [];
}

function mapDocs(cache: DocsCache, fn: (docs: DocMeta[]) => DocMeta[]): DocsCache {
  if (!cache) return cache;
  return { ...cache, pages: cache.pages.map((page) => ({ ...page, docs: fn(page.docs) })) };
}

/** A new document belongs at the top, which is the first page */
function prependDoc(cache: DocsCache, doc: DocMeta): DocsCache {
  if (!cache) return cache;
  const [first, ...rest] = cache.pages;
  if (!first) return cache;
  return {
    ...cache,
    pages: [
      { ...first, docs: [doc, ...first.docs], total: first.total === null ? null : first.total + 1 },
      ...rest,
    ],
  };
}

// Title writes and deletes share one mutation scope so TanStack runs them
// serially — an older PATCH can never land after a newer one and roll the
// title back, and a queued PATCH can't hit a document already deleted.
const DOCUMENT_MUTATION_SCOPE = { id: 'document' };

interface CacheSnapshot {
  docs: DocsCache;
  trash: DocsCache;
  starred: DocsCache;
}

interface StarWrite {
  id: string;
  starred: boolean;
}

interface TitleWrite {
  id: string;
  title: string;
  token: string | null;
}

/** Every cached document list, whatever is being searched for */
function docsListPrefix(token: string | null) {
  return ['documents', token ?? 'local', 'list'] as const;
}

function docsKey(token: string | null, q: string) {
  return [...docsListPrefix(token), q] as const;
}

function trashKey(token: string | null) {
  return ['documents', token ?? 'local', 'trash'] as const;
}

function starredKey(token: string | null) {
  return ['documents', token ?? 'local', 'starred'] as const;
}

/**
 * The document that was open last time. It is read before any document has
 * loaded, so it cannot be checked against the list here — whether it still
 * exists is settled once the list is known to be complete.
 */
function getStoredActiveId(): string {
  return localStorage.getItem(ACTIVE_DOC_KEY) ?? '';
}

export function useDocumentStore(token: string | null) {
  const queryClient = useQueryClient();

  // Searching is a query, not a filter over what happens to be loaded, so it
  // waits for a pause in typing before it becomes one.
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const DOCS_KEY = useMemo(() => docsKey(token, searchQuery), [token, searchQuery]);
  const docsQuery = useInfiniteQuery({
    queryKey: DOCS_KEY,
    queryFn: ({ pageParam }) => fetchDocuments(token, { q: searchQuery, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DocumentPage) => last.nextCursor,
  });
  const docs = useMemo(() => flatten(docsQuery.data), [docsQuery.data]);
  const total = docsQuery.data?.pages[0]?.total ?? null;

  const TRASH_KEY = useMemo(() => trashKey(token), [token]);
  // Only fetched once the user opens the trash
  const [trashOpen, setTrashOpen] = useState(false);
  const trashQuery = useInfiniteQuery({
    queryKey: TRASH_KEY,
    queryFn: ({ pageParam }) => fetchTrashedDocuments(token, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DocumentPage) => last.nextCursor,
    enabled: trashOpen,
  });
  const trashed = useMemo(() => flatten(trashQuery.data), [trashQuery.data]);

  // Starred documents are their own list so the sidebar can show them above
  // the rest. They stay in the main list too — starring marks a document, it
  // doesn't move it out of where it lives.
  const STARRED_KEY = useMemo(() => starredKey(token), [token]);
  const starredQuery = useInfiniteQuery({
    queryKey: STARRED_KEY,
    queryFn: ({ pageParam }) => fetchDocuments(token, { starred: true, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: DocumentPage) => last.nextCursor,
  });
  const starred = useMemo(() => flatten(starredQuery.data), [starredQuery.data]);

  const [activeId, setActiveId] = useState<string>(getStoredActiveId);

  // A document missing from the loaded pages isn't necessarily gone: it may be
  // further down the list, or filtered out by a search. Only fall back to the
  // top of the list when the whole of it is loaded and the document isn't in
  // it — otherwise opening the app would quietly switch document.
  const listIsComplete = !docsQuery.hasNextPage && searchQuery === '';
  const resolvedActiveId = docs.some((d) => d.id === activeId)
    ? activeId
    : listIsComplete
      ? (docs[0]?.id ?? '')
      : activeId;

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_DOC_KEY, id);
  }, []);

  const setCachedTitle = useCallback(
    (id: string, title: string) => {
      queryClient.setQueryData<DocsCache>(DOCS_KEY, (old) =>
        mapDocs(old, (list) =>
          list.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)),
        ),
      );
    },
    [queryClient, DOCS_KEY],
  );

  /**
   * The flag is written into every cached list straight away, so the star
   * fills the moment it is clicked. The starred list itself is refetched
   * rather than spliced: it is ordered by last edited, and where a
   * newly starred document belongs in that order is the server's to say.
   */
  const starMutation = useMutation({
    mutationFn: ({ id, starred: next }: StarWrite) => setStarred(id, next, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: ({ id, starred: next }) => {
      const previous = queryClient.getQueriesData<DocsCache>({ queryKey: docsListPrefix(token) });
      for (const [key] of previous) {
        queryClient.setQueryData<DocsCache>(key, (old) =>
          mapDocs(old, (list) => list.map((d) => (d.id === id ? { ...d, starred: next } : d))),
        );
      }
      return previous;
    },
    onError: (err, _vars, previous) => {
      console.error('Failed to change the star on a document:', err);
      for (const [key, cache] of previous ?? []) {
        queryClient.setQueryData<DocsCache>(key, cache);
      }
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: STARRED_KEY }); },
  });

  const createMutation = useMutation({
    mutationFn: () => createDocument(token),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<DocsCache>(DOCS_KEY, (old) => prependDoc(old, newDoc));
      switchTo(newDoc.id);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateDocument(id, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onSuccess: (copy) => {
      queryClient.setQueryData<DocsCache>(DOCS_KEY, (old) => prependDoc(old, copy));
      // Other searches hold a list without the copy in it
      void queryClient.invalidateQueries({ queryKey: docsListPrefix(token), refetchType: 'none' });
      switchTo(copy.id);
    },
    onError: (err) => { console.error('Failed to duplicate document:', err); },
  });

  // Persists a title. The cache is updated optimistically by the callers, so
  // this only talks to storage. The token travels with the write so a flush
  // that fires after sign-in/out still targets the store the edit was made in.
  const titleMutation = useMutation({
    mutationFn: ({ id, title, token: writeToken }: TitleWrite) =>
      renameDocument(id, title.trim() || 'Untitled', writeToken),
    scope: DOCUMENT_MUTATION_SCOPE,
    onError: (err) => { console.error('Failed to save document title:', err); },
  });
  const { mutate: persistTitle } = titleMutation;

  // ─── Debounced title sync ─────────────────────────────────────────────────
  // Typing in the editor title updates the sidebar immediately but only
  // persists after DEBOUNCE_MS of inactivity, instead of one write per keystroke.
  const pendingTitleRef = useRef<TitleWrite | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingTitle = useCallback((id?: string) => {
    if (id !== undefined && pendingTitleRef.current?.id !== id) return;
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = null;
    pendingTitleRef.current = null;
  }, []);

  const flushPendingTitle = useCallback(() => {
    const pending = pendingTitleRef.current;
    cancelPendingTitle();
    if (pending) persistTitle(pending);
  }, [cancelPendingTitle, persistTitle]);

  const touch = useCallback(
    (id: string, title: string) => {
      setCachedTitle(id, title);
      if (pendingTitleRef.current && pendingTitleRef.current.id !== id) flushPendingTitle();
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      pendingTitleRef.current = { id, title, token };
      titleTimerRef.current = setTimeout(flushPendingTitle, DEBOUNCE_MS);
    },
    [setCachedTitle, flushPendingTitle, token],
  );

  // Don't drop an in-flight edit when the tab closes or the store unmounts.
  // renameDocument uses `keepalive`, so the request survives page unload.
  useEffect(() => {
    window.addEventListener('pagehide', flushPendingTitle);
    return () => {
      window.removeEventListener('pagehide', flushPendingTitle);
      flushPendingTitle();
    };
  }, [flushPendingTitle]);

  const activate = useCallback(
    (id: string) => {
      flushPendingTitle();
      switchTo(id);
    },
    [flushPendingTitle, switchTo],
  );

  const rename = useCallback(
    (id: string, title: string) => {
      // An explicit rename supersedes any title still being typed for this doc
      cancelPendingTitle(id);
      setCachedTitle(id, title);
      persistTitle({ id, title, token });
    },
    [cancelPendingTitle, setCachedTitle, persistTitle, token],
  );

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeDocument(id, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onError: (err, _id, context) => {
      console.error('Failed to move document to the trash:', err);
      rollback(context as CacheSnapshot | undefined);
    },
    onMutate: (removedId) => {
      cancelPendingTitle(removedId);
      const before = snapshot();
      const loaded = flatten(before.docs);
      const removed = loaded.find((d) => d.id === removedId);
      const next = loaded.filter((d) => d.id !== removedId);
      queryClient.setQueryData<DocsCache>(DOCS_KEY, (old) =>
        mapDocs(old, (list) => list.filter((d) => d.id !== removedId)),
      );
      // Show it in the trash straight away if that list has been loaded
      if (removed) {
        queryClient.setQueryData<DocsCache>(TRASH_KEY, (old) =>
          prependDoc(old, { ...removed, deletedAt: Date.now() }),
        );
      }
      // A document in the trash is out of reach, starred or not
      if (removed?.starred) {
        queryClient.setQueryData<DocsCache>(STARRED_KEY, (old) =>
          mapDocs(old, (list) => list.filter((d) => d.id !== removedId)),
        );
      }
      if (next.length === 0) {
        // Offline mode always keeps one document around; signed in we let the
        // empty state show instead of creating a stray server-side document.
        if (!token) createMutation.mutate();
      } else if (removedId === resolvedActiveId) {
        switchTo(next[0].id);
      }
      return before;
    },
  });

  // Optimistic updates are rolled back if the write fails, so a failed
  // restore or delete can't leave the sidebar showing something untrue.
  const snapshot = useCallback((): CacheSnapshot => ({
    docs: queryClient.getQueryData<DocsCache>(DOCS_KEY),
    trash: queryClient.getQueryData<DocsCache>(TRASH_KEY),
    starred: queryClient.getQueryData<DocsCache>(STARRED_KEY),
  }), [queryClient, DOCS_KEY, TRASH_KEY, STARRED_KEY]);

  const rollback = useCallback((prev: CacheSnapshot | undefined) => {
    if (!prev) return;
    if (prev.docs) queryClient.setQueryData<DocsCache>(DOCS_KEY, prev.docs);
    if (prev.trash) queryClient.setQueryData<DocsCache>(TRASH_KEY, prev.trash);
    if (prev.starred) queryClient.setQueryData<DocsCache>(STARRED_KEY, prev.starred);
  }, [queryClient, DOCS_KEY, TRASH_KEY, STARRED_KEY]);

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreDocument(id, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: (id) => {
      const prev = snapshot();
      const restored = flatten(prev.trash).find((d) => d.id === id);
      queryClient.setQueryData<DocsCache>(TRASH_KEY, (old) =>
        mapDocs(old, (list) => list.filter((d) => d.id !== id)),
      );
      if (restored) {
        queryClient.setQueryData<DocsCache>(DOCS_KEY, (old) =>
          flatten(old).some((d) => d.id === id)
            ? old
            : prependDoc(old, { id, title: restored.title, updatedAt: restored.updatedAt }),
        );
      }
      return prev;
    },
    onError: (err, _id, prev) => { console.error('Failed to restore document:', err); rollback(prev); },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DOCS_KEY });
      // A restored document brings its star back with it
      void queryClient.invalidateQueries({ queryKey: STARRED_KEY });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => purgeDocument(id, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: (id) => {
      const prev = snapshot();
      queryClient.setQueryData<DocsCache>(TRASH_KEY, (old) =>
        mapDocs(old, (list) => list.filter((d) => d.id !== id)),
      );
      return prev;
    },
    onError: (err, _id, prev) => { console.error('Failed to delete document:', err); rollback(prev); },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => emptyTrash(token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: () => {
      const prev = snapshot();
      queryClient.setQueryData<DocsCache>(TRASH_KEY, (old) => mapDocs(old, () => []));
      return prev;
    },
    onError: (err, _vars, prev) => { console.error('Failed to empty the trash:', err); rollback(prev); },
  });

  // Everything handed out below keeps the same identity between renders.
  // TanStack's mutate and fetchNextPage are already stable, so these wrappers
  // are too — where a fresh closure per render would hand every consumer a
  // changed prop each time anything in the app re-rendered.
  const { fetchNextPage: fetchMoreDocs } = docsQuery;
  const loadMore = useCallback(() => { void fetchMoreDocs(); }, [fetchMoreDocs]);

  const { fetchNextPage: fetchMoreTrash } = trashQuery;
  const loadMoreTrash = useCallback(() => { void fetchMoreTrash(); }, [fetchMoreTrash]);

  const { mutateAsync: createDoc } = createMutation;
  const create = useCallback(async (): Promise<void> => { await createDoc(); }, [createDoc]);

  const { mutate: removeDoc } = removeMutation;
  const remove = useCallback((id: string) => { removeDoc(id); }, [removeDoc]);

  const { mutate: restoreDoc } = restoreMutation;
  const restore = useCallback((id: string) => { restoreDoc(id); }, [restoreDoc]);

  const { mutate: purgeDoc } = purgeMutation;
  const purge = useCallback((id: string) => { purgeDoc(id); }, [purgeDoc]);

  const { mutate: duplicateDoc } = duplicateMutation;
  const duplicate = useCallback((id: string) => { duplicateDoc(id); }, [duplicateDoc]);

  const { mutate: emptyTheTrash } = emptyTrashMutation;
  const clearTrash = useCallback(() => { emptyTheTrash(); }, [emptyTheTrash]);

  const { fetchNextPage: fetchMoreStarred } = starredQuery;
  const loadMoreStarred = useCallback(() => { void fetchMoreStarred(); }, [fetchMoreStarred]);

  const { mutate: writeStar } = starMutation;
  const toggleStar = useCallback(
    (id: string, next: boolean) => { writeStar({ id, starred: next }); },
    [writeStar],
  );

  return {
    docs,
    /** How many documents match in total, which can exceed the ones loaded */
    total,
    isLoading: docsQuery.isPending,
    hasMore: docsQuery.hasNextPage,
    loadMore,
    isLoadingMore: docsQuery.isFetchingNextPage,
    /** What is typed in the search box; the query follows after a pause */
    search,
    setSearch,
    activeId: resolvedActiveId,
    // create() is awaitable so the editor gets the real DB id before Hocuspocus connects
    create,
    rename,
    /** Moves the document to the trash — reversible */
    remove,
    activate,
    touch,
    trashed,
    trashOpen,
    /** Opening the trash is what loads it */
    setTrashOpen,
    restore,
    /** Destroys a trashed document and its content */
    purge,
    emptyTrash: clearTrash,
    trashHasMore: trashQuery.hasNextPage,
    loadMoreTrash,
    isLoadingMoreTrash: trashQuery.isFetchingNextPage,
    /** Copies a document and opens the copy */
    duplicate,
    /** Documents kept within reach, newest edit first */
    starred,
    starredHasMore: starredQuery.hasNextPage,
    loadMoreStarred,
    isLoadingMoreStarred: starredQuery.isFetchingNextPage,
    /** Star or unstar a document; starring does not count as editing it */
    toggleStar,
  };
}
