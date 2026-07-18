import { DOCS_LIST_KEY, DOC_KEY_PREFIX, STORAGE_KEY } from '../constants/autosave';
import type { AutoSaveData, DocMeta } from '../interfaces';

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function saveDocs(docs: DocMeta[]): void {
  localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(docs));
}

export async function fetchDocuments(): Promise<DocMeta[]> {
  const raw = localStorage.getItem(DOCS_LIST_KEY);
  if (raw) return JSON.parse(raw) as DocMeta[];

  // Migrate from old single-doc format
  const id = genId();
  const old = localStorage.getItem(STORAGE_KEY);
  let title = 'Untitled';
  try {
    if (old) title = (JSON.parse(old) as { title?: string }).title ?? 'Untitled';
  } catch { /* ignore */ }
  if (old) localStorage.setItem(`${DOC_KEY_PREFIX}${id}`, old);

  const docs: DocMeta[] = [{ id, title, updatedAt: Date.now() }];
  saveDocs(docs);
  return docs;
}

export async function createDocument(): Promise<DocMeta> {
  const id = genId();
  const doc: DocMeta = { id, title: 'Untitled', updatedAt: Date.now() };
  const docs = await fetchDocuments();
  saveDocs([doc, ...docs]);
  return doc;
}

export async function renameDocument(id: string, title: string): Promise<DocMeta> {
  const docs = await fetchDocuments();
  const updated = docs.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d));
  saveDocs(updated);
  return updated.find((d) => d.id === id)!;
}

export async function removeDocument(id: string): Promise<void> {
  const docs = await fetchDocuments();
  const next = docs.filter((d) => d.id !== id);
  localStorage.removeItem(`${DOC_KEY_PREFIX}${id}`);
  saveDocs(next);
}

export async function saveDocContent(docId: string, data: AutoSaveData): Promise<void> {
  localStorage.setItem(`${DOC_KEY_PREFIX}${docId}`, JSON.stringify(data));
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${apiUrl}/api/uploads`, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed (${res.status}): ${body}`);
  }
  return (await res.json()) as { url: string };
}
