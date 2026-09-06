import { DOCS_LIST_KEY, DOC_KEY_PREFIX, STORAGE_KEY } from '../constants/autosave';
import type { AutoSaveData, DocMeta } from '../interfaces';

const API_URL = import.meta.env.VITE_API_URL;

interface ApiDocRow {
  id: string;
  title: string;
  updated_at?: string;
}

function toDocMeta(row: ApiDocRow): DocMeta {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

function authHeaders(token: string, withBody = false): HeadersInit {
  return withBody
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { Authorization: `Bearer ${token}` };
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function saveDocs(docs: DocMeta[]): void {
  localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(docs));
}

function loadLocalDocs(): DocMeta[] {
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

// When a token is present the documents live in PostgreSQL (and sync over
// Hocuspocus); without one we fall back to the offline localStorage store.
export async function fetchDocuments(token: string | null): Promise<DocMeta[]> {
  if (!token) return loadLocalDocs();

  const res = await fetch(`${API_URL}/api/documents`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
  const rows = (await res.json()) as ApiDocRow[];
  return rows.map(toDocMeta);
}

export async function createDocument(token: string | null): Promise<DocMeta> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents`, {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({ title: 'Untitled' }),
    });
    if (!res.ok) throw new Error(`Failed to create document (${res.status})`);
    return toDocMeta((await res.json()) as ApiDocRow);
  }

  const doc: DocMeta = { id: genId(), title: 'Untitled', updatedAt: Date.now() };
  saveDocs([doc, ...loadLocalDocs()]);
  return doc;
}

export async function renameDocument(
  id: string,
  title: string,
  token: string | null,
): Promise<DocMeta> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents/${id}`, {
      method: 'PATCH',
      headers: authHeaders(token, true),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`Failed to rename document (${res.status})`);
    return { ...toDocMeta((await res.json()) as ApiDocRow), updatedAt: Date.now() };
  }

  const docs = loadLocalDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) throw new Error(`Document not found: ${id}`);
  const renamed = { ...doc, title, updatedAt: Date.now() };
  saveDocs(docs.map((d) => (d.id === id ? renamed : d)));
  return renamed;
}

export async function removeDocument(id: string, token: string | null): Promise<void> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to delete document (${res.status})`);
    return;
  }

  localStorage.removeItem(`${DOC_KEY_PREFIX}${id}`);
  saveDocs(loadLocalDocs().filter((d) => d.id !== id));
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
