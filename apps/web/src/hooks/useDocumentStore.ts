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

const DOCS_KEY = ['documents'] as const;

function getStoredActiveId(docs: DocMeta[]): string {
  const stored = localStorage.getItem(ACTIVE_DOC_KEY);
  return stored && docs.some((d) => d.id === stored) ? stored : (docs[0]?.id ?? '');
}

export function useDocumentStore() {
  const queryClient = useQueryClient();
  const { data: docs = [] } = useQuery({ queryKey: DOCS_KEY, queryFn: fetchDocuments });

  const [activeId, setActiveId] = useState<string>(() => getStoredActiveId(docs));

  const resolvedActiveId = docs.some((d) => d.id === activeId)
    ? activeId
    : (docs[0]?.id ?? '');

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_DOC_KEY, id);
  }, []);

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: (newDoc) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) => [newDoc, ...old]);
      switchTo(newDoc.id);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDocument(id, title),
    onMutate: ({ id, title }) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) =>
        old.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeDocument,
    onMutate: (removedId) => {
      const prev = queryClient.getQueryData<DocMeta[]>(DOCS_KEY) ?? [];
      const next = prev.filter((d) => d.id !== removedId);
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, next);
      if (next.length === 0) {
        createMutation.mutate();
      } else if (removedId === resolvedActiveId) {
        switchTo(next[0].id);
      }
    },
  });

  const touchMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDocument(id, title),
    onMutate: ({ id, title }) => {
      queryClient.setQueryData<DocMeta[]>(DOCS_KEY, (old = []) =>
        old.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)),
      );
    },
  });

  return {
    docs,
    activeId: resolvedActiveId,
    create: () => { createMutation.mutate(); },
    rename: (id: string, title: string) => renameMutation.mutate({ id, title }),
    remove: (id: string) => removeMutation.mutate(id),
    activate: switchTo,
    touch: (id: string, title: string) => touchMutation.mutate({ id, title }),
  };
}
