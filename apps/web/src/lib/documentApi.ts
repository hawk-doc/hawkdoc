import { DOCS_LIST_KEY, DOC_KEY_PREFIX, STORAGE_KEY, TRASH_LIST_KEY } from '../constants/autosave';
import { MAX_TITLE_LENGTH } from '../constants/editor';
import { clearLocalVersions } from './versions/localVersions';
import type { AutoSaveData, DocMeta } from '../interfaces';

const API_URL = import.meta.env.VITE_API_URL;

/** Matches the API's default page size, so both stores feel the same */
const LOCAL_PAGE_SIZE = 50;

/** One page of documents, and where the next one starts */
export interface DocumentPage {
  docs: DocMeta[];
  /** Pass back as `cursor` to continue; null when there is no more */
  nextCursor: string | null;
  /** How many documents match in total — only known on the first page */
  total: number | null;
}

export interface PageOptions {
  /** Title search, matched anywhere, case-insensitively */
  q?: string;
  cursor?: string | null;
}

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

export function authHeaders(token: string, withBody = false): HeadersInit {
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

/** Shared by every authenticated call so a 401 always ends the session */
export function ensureOk(res: Response, token: string, action: string): void {
  if (res.status === 401) throw new UnauthorizedError(token);
  if (!res.ok) throw new Error(`Failed to ${action} (${res.status})`);
}

/**
 * The cursor the API put in its Link header. The header carries a whole URL;
 * only the cursor matters here, since the client builds its own.
 */
function cursorFromLink(link: string | null): string | null {
  const match = /<([^>]+)>;\s*rel="next"/.exec(link ?? '');
  if (!match) return null;
  return new URL(match[1]!, API_URL).searchParams.get('cursor');
}

function pageUrl(path: string, options: PageOptions, extra?: Record<string, string>): string {
  const url = new URL(path, API_URL);
  if (options.q) url.searchParams.set('q', options.q);
  if (options.cursor) url.searchParams.set('cursor', options.cursor);
  for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Offline there is no server to page, but the same contract has to hold or the
 * caller would need two shapes. The documents are already in memory, so a page
 * is a slice of them — the cursor is the id the previous page ended on.
 */
function localPage(docs: DocMeta[], options: PageOptions, pageSize = LOCAL_PAGE_SIZE): DocumentPage {
  const q = options.q?.trim().toLowerCase();
  const matching = q
    ? docs.filter((doc) => (doc.title.trim() || 'Untitled').toLowerCase().includes(q))
    : docs;

  const start = options.cursor
    ? matching.findIndex((doc) => doc.id === options.cursor) + 1
    : 0;
  const page = matching.slice(start, start + pageSize);
  const last = page[page.length - 1];

  return {
    docs: page,
    nextCursor: last && start + page.length < matching.length ? last.id : null,
    total: options.cursor ? null : matching.length,
  };
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
export async function fetchDocuments(
  token: string | null,
  options: PageOptions = {},
): Promise<DocumentPage> {
  if (!token) return localPage(loadLocalDocs(), options);

  const res = await fetch(pageUrl('/api/documents', options), { headers: authHeaders(token) });
  ensureOk(res, token, 'load documents');
  const rows = (await res.json()) as ApiDocRow[];
  const total = res.headers.get('X-Total-Count');
  return {
    docs: rows.map(toDocMeta),
    nextCursor: cursorFromLink(res.headers.get('Link')),
    total: total === null ? null : Number(total),
  };
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

/** Copy a document, content and all. Offline the content key is copied too. */
export async function duplicateDocument(id: string, token: string | null): Promise<DocMeta> {
  if (token) {
    const res = await fetch(`${API_URL}/api/documents/${id}/duplicate`, {
      method: 'POST',
      headers: authHeaders(token),
    });
    ensureOk(res, token, 'duplicate document');
    return toDocMeta((await res.json()) as ApiDocRow);
  }

  const docs = loadLocalDocs();
  const source = docs.find((doc) => doc.id === id);
  if (!source) throw new Error(`Document not found: ${id}`);

  const copy: DocMeta = {
    id: genId(),
    title: `Copy of ${source.title}`.slice(0, MAX_TITLE_LENGTH),
    updatedAt: Date.now(),
  };
  const content = localStorage.getItem(`${DOC_KEY_PREFIX}${id}`);
  if (content) localStorage.setItem(`${DOC_KEY_PREFIX}${copy.id}`, content);
  saveDocs([copy, ...docs]);
  return copy;
}

/** Documents in the trash, newest deletion first */
export async function fetchTrashedDocuments(
  token: string | null,
  options: PageOptions = {},
): Promise<DocumentPage> {
  if (!token) {
    const trashed = [...loadLocalTrash()].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    return localPage(trashed, options);
  }

  const res = await fetch(pageUrl('/api/documents', options, { trash: 'true' }), {
    headers: authHeaders(token),
  });
  ensureOk(res, token, 'load the trash');
  const rows = (await res.json()) as ApiDocRow[];
  const total = res.headers.get('X-Total-Count');
  return {
    docs: rows.map(toDocMeta),
    nextCursor: cursorFromLink(res.headers.get('Link')),
    total: total === null ? null : Number(total),
  };
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
  clearLocalVersions(id);
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
  for (const doc of trashed) {
    localStorage.removeItem(`${DOC_KEY_PREFIX}${doc.id}`);
    clearLocalVersions(doc.id);
  }
  saveTrash([]);
  return trashed.length;
}

export async function saveDocContent(docId: string, data: AutoSaveData): Promise<void> {
  localStorage.setItem(`${DOC_KEY_PREFIX}${docId}`, JSON.stringify(data));
}

/** The API answers `{ error }`; fall back to the status for anything else */
function uploadErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
  } catch {
    // not JSON (e.g. a proxy's error page)
  }
  return `Upload failed (${status})`;
}

export async function uploadImage(file: File, token: string | null): Promise<{ url: string }> {
  if (!token) throw new Error('Sign in to upload images');
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${apiUrl}/api/uploads`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(uploadErrorMessage(res.status, body));
  }
  return (await res.json()) as { url: string };
}
