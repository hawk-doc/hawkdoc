import type { SerializedEditorState } from 'lexical';
import { authHeaders, ensureOk } from './documentApi';
import {
  listLocalVersions,
  readLocalVersion,
  saveLocalVersion,
  nameLocalVersion,
} from './versions/localVersions';

const API_URL = import.meta.env.VITE_API_URL;

export interface DocVersion {
  id: string;
  /** When the version was recorded, as a timestamp */
  createdAt: number;
  /** The name the reader gave it. A named version is never trimmed. */
  label: string | null;
}

/** The reasons the API gives for refusing to write a version */
export type VersionRefusal = 'nothing-to-save' | 'too-many-names' | 'no-room';

/**
 * Why a version couldn't be written, in words the panel can show. `code`
 * is for callers that have to act on the reason rather than report it.
 */
export class VersionWriteError extends Error {
  readonly code: VersionRefusal | null;

  constructor(message: string, code: VersionRefusal | null = null) {
    super(message);
    this.name = 'VersionWriteError';
    this.code = code;
  }
}

const TOO_MANY_NAMES = 'This document already holds as many named versions as it can.';
const NO_ROOM = 'There is no room left in this browser to keep another version.';

// Reading a version needs Yjs and the Lexical binding, which the editor only
// loads for signed-in documents. Keep it out of the initial bundle, like the
// exporters.
let decoderPromise: Promise<typeof import('./versions/decode')> | null = null;

function loadDecoder(): Promise<typeof import('./versions/decode')> {
  decoderPromise ??= import('./versions/decode').catch((err: unknown) => {
    decoderPromise = null;
    throw err;
  });
  return decoderPromise;
}

/** Fetch the version reader before it's needed — call on signs of intent */
export function preloadVersionHistory(): void {
  loadDecoder().catch(() => { /* retried when a version is opened */ });
}

interface ApiVersionRow {
  id: string;
  createdAt: string;
  label?: string | null;
}

/** Convert API metadata to a timestamp in milliseconds and a nullable label. */
function toDocVersion(row: ApiVersionRow): DocVersion {
  return {
    id: row.id,
    createdAt: new Date(row.createdAt).getTime(),
    label: row.label ?? null,
  };
}

/** A document's versions, newest first */
export async function fetchVersions(docId: string, token: string | null): Promise<DocVersion[]> {
  if (!token) {
    return listLocalVersions(docId).map((version) => ({
      id: version.id,
      createdAt: version.createdAt,
      label: version.label ?? null,
    }));
  }

  const res = await fetch(`${API_URL}/api/documents/${docId}/versions`, {
    headers: authHeaders(token),
  });
  ensureOk(res, token, 'load version history');
  const rows = (await res.json()) as ApiVersionRow[];
  return rows.map(toDocVersion);
}

/**
 * Reads the error the API sent, so a refusal the reader can act on — the cap
 * on names — doesn't surface as a bare status code.
 */
async function writeFailure(res: Response, fallback: string): Promise<never> {
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
    const code =
      body.code === 'nothing-to-save' || body.code === 'too-many-names' ? body.code : null;
    throw new VersionWriteError(
      typeof body.error === 'string' ? body.error : TOO_MANY_NAMES,
      code,
    );
  }
  throw new Error(`${fallback} (${res.status})`);
}

/**
 * Save a version of the document as it stands, under an optional name.
 *
 * Signed in the server reads the document itself, so it needs no content;
 * offline the caller passes the editor state, because there is nowhere else
 * for it to come from.
 */
export async function saveVersion(
  docId: string,
  label: string | null,
  token: string | null,
  localContent?: string,
): Promise<void> {
  if (!token) {
    if (localContent === undefined) {
      throw new VersionWriteError('There is nothing to save yet.', 'nothing-to-save');
    }
    const outcome = saveLocalVersion(docId, localContent, label);
    if (outcome === 'too-many-names') throw new VersionWriteError(TOO_MANY_NAMES, 'too-many-names');
    if (outcome === 'no-room') throw new VersionWriteError(NO_ROOM, 'no-room');
    return;
  }

  const res = await fetch(`${API_URL}/api/documents/${docId}/versions`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ label }),
  });
  if (res.status === 401 || res.ok) {
    ensureOk(res, token, 'save a version');
    return;
  }
  await writeFailure(res, 'Failed to save a version');
}

/**
 * Keeps the document as it stands, so an action that replaces it wholesale can
 * be undone.
 *
 * Deliberately unnamed. A name would make the version unprunable *and* spend
 * the reader's cap on names they never chose — after a few imports they could
 * not name their own versions any more. They can name it afterwards if they
 * want to keep it.
 *
 * Resolves when the document is recoverable and throws when it isn't, so the
 * caller can refuse to go ahead. A document with nothing in it has nothing to
 * recover, which counts as recoverable.
 */
export async function saveRecoveryPoint(
  docId: string,
  token: string | null,
  localContent?: string,
): Promise<void> {
  try {
    await saveVersion(docId, null, token, localContent);
  } catch (err) {
    // 'nothing-to-save' is the empty document: nothing to protect, so the
    // action it precedes is free to go ahead. Every other refusal stands.
    if (err instanceof VersionWriteError && err.code === 'nothing-to-save') return;
    throw err;
  }
}

/** Name a version, or clear its name by passing null */
export async function nameVersion(
  docId: string,
  versionId: string,
  label: string | null,
  token: string | null,
): Promise<void> {
  if (!token) {
    const outcome = nameLocalVersion(docId, versionId, label);
    if (outcome === 'too-many-names') throw new VersionWriteError(TOO_MANY_NAMES, 'too-many-names');
    if (outcome === 'no-room') throw new VersionWriteError(NO_ROOM, 'no-room');
    if (outcome === 'not-found') throw new Error('That version is no longer available.');
    return;
  }

  const res = await fetch(`${API_URL}/api/documents/${docId}/versions/${versionId}`, {
    method: 'PATCH',
    headers: authHeaders(token, true),
    body: JSON.stringify({ label }),
  });
  if (res.status === 401 || res.ok) {
    ensureOk(res, token, 'name this version');
    return;
  }
  await writeFailure(res, 'Failed to name this version');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseLocalContent(content: string): SerializedEditorState {
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== 'object' || parsed === null || !('root' in parsed)) {
    throw new Error('This version could not be read.');
  }
  return parsed as SerializedEditorState;
}

/**
 * The editor state a version holds. Signed in, the server returns the Yjs
 * state as of that version and the binding turns it back into a Lexical state;
 * offline, the snapshot is already one.
 */
export async function fetchVersionContent(
  docId: string,
  versionId: string,
  token: string | null,
): Promise<SerializedEditorState> {
  if (!token) {
    const content = readLocalVersion(docId, versionId);
    if (content === null) throw new Error('That version is no longer available.');
    return parseLocalContent(content);
  }

  const res = await fetch(`${API_URL}/api/documents/${docId}/versions/${versionId}`, {
    headers: authHeaders(token),
  });
  ensureOk(res, token, 'load this version');
  const { yjsState } = (await res.json()) as { yjsState: string };

  const { editorStateFromYjsUpdate } = await loadDecoder();
  return editorStateFromYjsUpdate(base64ToBytes(yjsState));
}
