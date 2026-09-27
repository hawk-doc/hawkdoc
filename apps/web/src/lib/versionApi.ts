import type { SerializedEditorState } from 'lexical';
import { authHeaders, ensureOk } from './documentApi';
import { listLocalVersions, readLocalVersion } from './versions/localVersions';

const API_URL = import.meta.env.VITE_API_URL;

export interface DocVersion {
  id: string;
  /** When the version was recorded, as a timestamp */
  createdAt: number;
}

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
}

/** A document's versions, newest first */
export async function fetchVersions(docId: string, token: string | null): Promise<DocVersion[]> {
  if (!token) {
    return listLocalVersions(docId).map((version) => ({
      id: version.id,
      createdAt: version.createdAt,
    }));
  }

  const res = await fetch(`${API_URL}/api/documents/${docId}/versions`, {
    headers: authHeaders(token),
  });
  ensureOk(res, token, 'load version history');
  const rows = (await res.json()) as ApiVersionRow[];
  return rows.map((row) => ({ id: row.id, createdAt: new Date(row.createdAt).getTime() }));
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
