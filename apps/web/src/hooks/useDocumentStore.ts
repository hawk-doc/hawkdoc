import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_DOC_KEY, DEBOUNCE_MS } from '../constants/autosave';
import {
  fetchDocuments,
  fetchTrashedDocuments,
  createDocument,
  renameDocument,
  removeDocument,
  restoreDocument,
  purgeDocument,
  emptyTrash,
} from '../lib/documentApi';
import type { DocMeta } from '../interfaces';

// Title writes and deletes share one mutation scope so TanStack runs them
// serially — an older PATCH can never land after a newer one and roll the
// title back, and a queued PATCH can't hit a document already deleted.
const DOCUMENT_MUTATION_SCOPE = { id: 'document' };

interface TitleWrite {
  id: string;
  title: string;
  token: string | null;
}

function docsKey(token: string | null) {
  return ['documents', token ?? 'local'] as const;
}

function trashKey(token: string | null) {
  return ['documents', token ?? 'local', 'trash'] as const;
}

function getStoredActiveId(docs: DocMeta[]): string {
  const stored = localStorage.getItem(ACTIVE_DOC_KEY);
  return stored && docs.some((d) => d.id === stored) ? stored : (docs[0]?.id ?? '');
}

export function useDocumentStore(token: string | null) {
  const queryClient = useQueryClient();
  const DOCS_KEY = docsKey(token);
  const { data: docs = [] } = useQuery({
    queryKey: DOCS_KEY,
    queryFn: () => fetchDocuments(token),
  });

  const TRASH_KEY = trashKey(token);
  // Only fetched once the user opens the trash
  const [trashOpen, setTrashOpen] = useState(false);
  const { data: trashed = [] } = useQuery({
    queryKey: TRASH_KEY,
    queryFn: () => fetchTrashedDocuments(token),
    enabled: trashOpen,
  });

  const [activeId, setActiveId] = useState<string>(() => getStoredActiveId(docs));

  const resolvedActiveId = docs.some((d) => d.id === activeId)
    ? activeId
    : (docs[0]?.id ?? '');

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_DOC_KEY, id);
  }, []);

  const setCachedTitle = useCallback(
    (id: string, title: string) => {
      queryClient.setQueryData<DocMeta[]>(docsKey(token), (old = []) =>
        old.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)),
      );
    },
    [queryClient, token],
  );

  const createMutation = useMutation({
    mutationFn: () => createDocument(token),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) => [newDoc, ...old]);
      switchTo(newDoc.id);
    },
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
    onMutate: (removedId) => {
      cancelPendingTitle(removedId);
      const prev = queryClient.getQueryData<DocMeta[]>(DOCS_KEY) ?? [];
      const removed = prev.find((d) => d.id === removedId);
      const next = prev.filter((d) => d.id !== removedId);
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, next);
      // Show it in the trash straight away if that list has been loaded
      if (removed) {
        queryClient.setQueryData<DocMeta[]>(TRASH_KEY, (old) =>
          old ? [{ ...removed, deletedAt: Date.now() }, ...old] : old,
        );
      }
      if (next.length === 0) {
        // Offline mode always keeps one document around; signed in we let the
        // empty state show instead of creating a stray server-side document.
        if (!token) createMutation.mutate();
      } else if (removedId === resolvedActiveId) {
        switchTo(next[0].id);
      }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreDocument(id, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: (id) => {
      const restored = queryClient.getQueryData<DocMeta[]>(TRASH_KEY)?.find((d) => d.id === id);
      queryClient.setQueryData<DocMeta[]>(TRASH_KEY, (old = []) => old.filter((d) => d.id !== id));
      if (restored) {
        queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) =>
          old.some((d) => d.id === id) ? old : [{ id, title: restored.title, updatedAt: restored.updatedAt }, ...old],
        );
      }
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: DOCS_KEY }); },
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => purgeDocument(id, token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: (id) => {
      queryClient.setQueryData<DocMeta[]>(TRASH_KEY, (old = []) => old.filter((d) => d.id !== id));
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => emptyTrash(token),
    scope: DOCUMENT_MUTATION_SCOPE,
    onMutate: () => { queryClient.setQueryData<DocMeta[]>(TRASH_KEY, []); },
  });

  return {
    docs,
    activeId: resolvedActiveId,
    // create() is awaitable so the editor gets the real DB id before Hocuspocus connects
    create: async (): Promise<void> => { await createMutation.mutateAsync(); },
    rename,
    /** Moves the document to the trash — reversible */
    remove: (id: string) => removeMutation.mutate(id),
    activate,
    touch,
    trashed,
    trashOpen,
    /** Opening the trash is what loads it */
    setTrashOpen,
    restore: (id: string) => restoreMutation.mutate(id),
    /** Destroys a trashed document and its content */
    purge: (id: string) => purgeMutation.mutate(id),
    emptyTrash: () => emptyTrashMutation.mutate(),
  };
}
