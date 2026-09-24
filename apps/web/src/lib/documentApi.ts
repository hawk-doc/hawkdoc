import { DOCS_LIST_KEY, DOC_KEY_PREFIX, STORAGE_KEY, TRASH_LIST_KEY } from '../constants/autosave';
import type { AutoSaveData, DocMeta } from '../interfaces';

const API_URL = import.meta.env.VITE_API_URL;

interface ApiDocRow {
  id: string;
  title: string;
  updated_at?: string;
  deleted_at?: string | null;
}

function toDocMeta(row: ApiDocRow): DocMeta {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    ...(row.deleted_at ? { deletedAt: new Date(row.deleted_at).getTime() } : {}),
  };
}

function authHeaders(token: string, withBody = false): HeadersInit {
  return withBody
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { Authorization: `Bearer ${token}` };
}

/**
 * The API rejected the token (expired or invalid), so the session is over.
 * Remembers which token failed so a late 401 from a previous session can't
 * sign out a newer one.
 */
export class UnauthorizedError extends Error {
  readonly #token: string;

  constructor(token: string) {
    super('Your session has expired');
    this.name = 'UnauthorizedError';
    this.#token = token;
  }

  isFor(token: string | null): boolean {
    return token === this.#token;
  }
}

function ensureOk(res: Response, token: string, action: string): void {
  if (res.status === 401) throw new UnauthorizedError(token);
  if (!res.ok) throw new Error(`Failed to ${action} (${res.status})`);
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function saveDocs(docs: DocMeta[]): void {
  localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(docs));
}

// Offline trash. Content stays under its DOC_KEY_PREFIX key while a document
// sits in the trash, so restoring brings the text back with it.
function loadLocalTrash(): DocMeta[] {
  const raw = localStorage.getItem(TRASH_LIST_KEY);
  return raw ? (JSON.parse(raw) as DocMeta[]) : [];
}

function saveTrash(docs: DocMeta[]): void {
  localStorage.setItem(TRASH_LIST_KEY, JSON.stringify(docs));
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
  ensureOk(res, token, 'load documents');
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
    ensureOk(res, token, 'create document');
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
      // Lets a title flushed from `pagehide` finish after the tab closes
      keepalive: true,
    });
    ensureOk(res, token, 'rename document');
    return { ...toDocMeta((await res.json()) as ApiDocRow), updatedAt: Date.now() };
  }

  const docs = loadLocalDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) throw new Error(`Document not found: ${id}`);
  const renamed = { ...doc, title, updatedAt: Date.now() };
  saveDocs(docs.map((d) => (d.id === id ? renamed : d)));
  return renamed;
}

/** Documents in the trash, newest deletion first */
export async function fetchTrashedDocuments(token: string | null): Promise<DocMeta[]> {
  if (!token) return [...loadLocalTrash()].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const res = await fetch(`${API_URL}/api/documents?trash=true`, { headers: authHeaders(token) });
  ensureOk(res, token, 'load the trash');
  const rows = (await res.json()) as ApiDocRow[];
  return rows.map(toDocMeta);
}

/** Move a document to the trash. Reversible — nothing is destroyed here. */
export async function removeDocument(id: string, token: string | null): Promise<void> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    ensureOk(res, token, 'delete document');
    return;
  }

  const doc = loadLocalDocs().find((d) => d.id === id);
  if (!doc) return;
  // Write the destination list first: setItem can throw (quota), and losing
  // the entry from both lists would strand the document with no way back.
  saveTrash([{ ...doc, deletedAt: Date.now() }, ...loadLocalTrash().filter((d) => d.id !== id)]);
  saveDocs(loadLocalDocs().filter((d) => d.id !== id));
}

export async function restoreDocument(id: string, token: string | null): Promise<DocMeta> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents/${id}/restore`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    ensureOk(res, token, 'restore document');
    return toDocMeta((await res.json()) as ApiDocRow);
  }

  const doc = loadLocalTrash().find((d) => d.id === id);
  if (!doc) throw new Error(`Document not found in trash: ${id}`);
  const restored: DocMeta = { id: doc.id, title: doc.title, updatedAt: doc.updatedAt };
  // Destination first, as above — a document in both lists briefly is
  // recoverable, a document in neither is not.
  saveDocs([restored, ...loadLocalDocs().filter((d) => d.id !== id)]);
  saveTrash(loadLocalTrash().filter((d) => d.id !== id));
  return restored;
}

/** Delete a trashed document for good, with its content. */
export async function purgeDocument(id: string, token: string | null): Promise<void> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents/${id}/permanent`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    ensureOk(res, token, 'delete document permanently');
    return;
  }

  localStorage.removeItem(`${DOC_KEY_PREFIX}${id}`);
  saveTrash(loadLocalTrash().filter((d) => d.id !== id));
}

/** Empty the trash. Returns how many documents were destroyed. */
export async function emptyTrash(token: string | null): Promise<number> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    ensureOk(res, token, 'empty the trash');
    const { deleted } = (await res.json()) as { deleted: number };
    return deleted;
  }

  const trashed = loadLocalTrash();
  for (const doc of trashed) localStorage.removeItem(`${DOC_KEY_PREFIX}${doc.id}`);
  saveTrash([]);
  return trashed.length;
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
