import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_DOC_KEY } from '../constants/autosave';
import {
  fetchDocuments,
  createDocument,
  renameDocument,
  removeDocument,
} from '../lib/documentApi';
import type { DocMeta } from '../interfaces';

function docsKey(token: string | null) {
  return ['documents', token ?? 'local'] as const;
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

  const [activeId, setActiveId] = useState<string>(() => getStoredActiveId(docs));

  const resolvedActiveId = docs.some((d) => d.id === activeId)
    ? activeId
    : (docs[0]?.id ?? '');

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_DOC_KEY, id);
  }, []);

  const createMutation = useMutation({
    mutationFn: () => createDocument(token),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) => [newDoc, ...old]);
      switchTo(newDoc.id);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDocument(id, title, token),
    onMutate: ({ id, title }) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) =>
        old.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeDocument(id, token),
    onMutate: (removedId) => {
      const prev = queryClient.getQueryData<DocMeta[]>(DOCS_KEY) ?? [];
      const next = prev.filter((d) => d.id !== removedId);
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, next);
      if (next.length === 0) {
        // Offline mode always keeps one document around; signed in we let the
        // empty state show instead of creating a stray server-side document.
        if (!token) createMutation.mutate();
      } else if (removedId === resolvedActiveId) {
        switchTo(next[0].id);
      }
    },
  });

  const touchMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDocument(id, title, token),
    onMutate: ({ id, title }) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) =>
        old.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)),
      );
    },
  });

  return {
    docs,
    activeId: resolvedActiveId,
    // create() is awaitable so the editor gets the real DB id before Hocuspocus connects
    create: async (): Promise<void> => { await createMutation.mutateAsync(); },
    rename: (id: string, title: string) => renameMutation.mutate({ id, title }),
    remove: (id: string) => removeMutation.mutate(id),
    activate: switchTo,
    touch: (id: string, title: string) => touchMutation.mutate({ id, title }),
  };
}
