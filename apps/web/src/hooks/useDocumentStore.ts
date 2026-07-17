import { useCallback, useEffect, useState } from 'react';
import { DOCS_LIST_KEY, DOC_KEY_PREFIX, ACTIVE_DOC_KEY, STORAGE_KEY } from '../constants/autosave';
import type { DocMeta } from '../types/editor';

const API_URL = import.meta.env.VITE_API_URL;

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function saveLocalDocs(docs: DocMeta[]): void {
  localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(docs));
}

function loadLocalDocs(): DocMeta[] {
  try {
    const raw = localStorage.getItem(DOCS_LIST_KEY);
    if (raw) return JSON.parse(raw) as DocMeta[];
  } catch { /* ignore */ }

  // Migrate from old single-doc format
  const id = genId();
  const old = localStorage.getItem(STORAGE_KEY);
  let title = 'Untitled';
  try { if (old) title = (JSON.parse(old) as { title?: string }).title ?? 'Untitled'; } catch { /* ignore */ }
  if (old) localStorage.setItem(`${DOC_KEY_PREFIX}${id}`, old);

  const docs: DocMeta[] = [{ id, title, updatedAt: Date.now() }];
  saveLocalDocs(docs);
  return docs;
}

function loadLocalActiveId(docs: DocMeta[]): string {
  const stored = localStorage.getItem(ACTIVE_DOC_KEY);
  return stored && docs.some((d) => d.id === stored) ? stored : (docs[0]?.id ?? '');
}

function apiHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export function useDocumentStore(token: string | null) {
  const [docs, setDocs] = useState<DocMeta[]>(() => (token ? [] : loadLocalDocs()));
  const [activeId, setActiveId] = useState<string>(() => {
    if (token) return '';
    const local = loadLocalDocs();
    return loadLocalActiveId(local);
  });

  // Sync with API whenever token changes
  useEffect(() => {
    if (!token) {
      const local = loadLocalDocs();
      setDocs(local);
      setActiveId(loadLocalActiveId(local));
      return;
    }

    fetch(`${API_URL}/api/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load documents');
        return r.json() as Promise<Array<{ id: string; title: string; updated_at: string }>>;
      })
      .then((rows) => {
        const apiDocs: DocMeta[] = rows.map((r) => ({
          id: r.id,
          title: r.title,
          updatedAt: new Date(r.updated_at).getTime(),
        }));
        setDocs(apiDocs);
        setActiveId(apiDocs[0]?.id ?? '');
      })
      .catch(console.error);
  }, [token]);

  const updateLocal = useCallback(
    (next: DocMeta[]) => {
      setDocs(next);
      if (!token) saveLocalDocs(next);
    },
    [token],
  );

  const switchTo = useCallback(
    (id: string) => {
      setActiveId(id);
      if (!token) localStorage.setItem(ACTIVE_DOC_KEY, id);
    },
    [token],
  );

  // create() is async in API mode so the editor gets the real DB UUID before Hocuspocus connects
  const create = useCallback(async (): Promise<void> => {
    if (token) {
      const res = await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({ title: 'Untitled' }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      const created = (await res.json()) as { id: string; title: string };
      const newDoc: DocMeta = { id: created.id, title: created.title, updatedAt: Date.now() };
      setDocs((prev) => [newDoc, ...prev]);
      switchTo(created.id);
    } else {
      const id = genId();
      const local = loadLocalDocs();
      const next = [{ id, title: 'Untitled', updatedAt: Date.now() }, ...local];
      updateLocal(next);
      switchTo(id);
    }
  }, [token, switchTo, updateLocal]);

  const rename = useCallback(
    (id: string, title: string) => {
      updateLocal(docs.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)));
      if (token) {
        void fetch(`${API_URL}/api/documents/${id}`, {
          method: 'PATCH',
          headers: apiHeaders(token),
          body: JSON.stringify({ title }),
        }).catch(console.error);
      }
    },
    [docs, token, updateLocal],
  );

  const remove = useCallback(
    (id: string) => {
      const next = docs.filter((d) => d.id !== id);

      if (token) {
        void fetch(`${API_URL}/api/documents/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(console.error);

        setDocs(next);
        if (id === activeId) setActiveId(next[0]?.id ?? '');
      } else {
        localStorage.removeItem(`${DOC_KEY_PREFIX}${id}`);
        if (next.length === 0) {
          const newId = genId();
          const fresh: DocMeta[] = [{ id: newId, title: 'Untitled', updatedAt: Date.now() }];
          updateLocal(fresh);
          switchTo(newId);
        } else {
          updateLocal(next);
          if (id === activeId) switchTo(next[0].id);
        }
      }
    },
    [docs, activeId, token, updateLocal, switchTo],
  );

  // touch = optimistic title update (also syncs to API)
  const touch = useCallback(
    (id: string, title: string) => {
      updateLocal(docs.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)));
      if (token) {
        void fetch(`${API_URL}/api/documents/${id}`, {
          method: 'PATCH',
          headers: apiHeaders(token),
          body: JSON.stringify({ title }),
        }).catch(console.error);
      }
    },
    [docs, token, updateLocal],
  );

  return { docs, activeId, create, rename, remove, activate: switchTo, touch };
}
