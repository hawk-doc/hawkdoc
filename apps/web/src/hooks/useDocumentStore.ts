import { useState } from 'react';
import { DOCS_LIST_KEY, DOC_KEY_PREFIX, ACTIVE_DOC_KEY, STORAGE_KEY } from '../constants/autosave';
import type { DocMeta } from '../types/editor';

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function saveDocs(docs: DocMeta[]): void {
  localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(docs));
}

function initialDocs(): DocMeta[] {
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
  saveDocs(docs);
  return docs;
}

function initialActiveId(docs: DocMeta[]): string {
  const stored = localStorage.getItem(ACTIVE_DOC_KEY);
  return stored && docs.some((d) => d.id === stored) ? stored : (docs[0]?.id ?? '');
}

export function useDocumentStore() {
  const [docs, setDocs] = useState<DocMeta[]>(initialDocs);
  const [activeId, setActiveId] = useState<string>(() => initialActiveId(initialDocs()));

  const update = (next: DocMeta[]) => {
    setDocs(next);
    saveDocs(next);
  };

  const switchTo = (id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_DOC_KEY, id);
  };

  const create = (): string => {
    const id = genId();
    const next = [{ id, title: 'Untitled', updatedAt: Date.now() }, ...docs];
    update(next);
    switchTo(id);
    return id;
  };

  const rename = (id: string, title: string) => {
    update(docs.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)));
  };

  const remove = (id: string) => {
    const next = docs.filter((d) => d.id !== id);
    localStorage.removeItem(`${DOC_KEY_PREFIX}${id}`);
    if (next.length === 0) {
      const newId = genId();
      const fresh: DocMeta[] = [{ id: newId, title: 'Untitled', updatedAt: Date.now() }];
      update(fresh);
      switchTo(newId);
    } else {
      update(next);
      if (id === activeId) switchTo(next[0].id);
    }
  };

  const touch = (id: string, title: string) => {
    update(docs.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d)));
  };

  return { docs, activeId, create, rename, remove, activate: switchTo, touch };
}
