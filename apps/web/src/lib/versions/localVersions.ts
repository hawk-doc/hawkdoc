import { VERSIONS_KEY_PREFIX } from '../../constants/autosave';

/**
 * Version history for documents that aren't signed in.
 *
 * Signed in, versions are Yjs deltas in PostgreSQL. There is no Yjs here — the
 * offline store keeps the editor state as JSON — so a local version is a
 * snapshot of that JSON, kept to a small number so history can't crowd out the
 * documents themselves.
 */

/** A snapshot is taken at most this often, matching the server's throttle */
export const LOCAL_VERSION_INTERVAL_MS = 5 * 60_000;

/** How many snapshots a local document keeps */
export const MAX_LOCAL_VERSIONS = 20;

export interface LocalVersion {
  id: string;
  createdAt: number;
  /** A serialised Lexical editor state */
  content: string;
}

function key(docId: string): string {
  return `${VERSIONS_KEY_PREFIX}${docId}`;
}

function isLocalVersion(value: unknown): value is LocalVersion {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['createdAt'] === 'number' &&
    typeof candidate['content'] === 'string'
  );
}

/** A document's snapshots, newest first */
export function listLocalVersions(docId: string): LocalVersion[] {
  try {
    const raw = localStorage.getItem(key(docId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalVersion).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    // Unreadable history is not worth failing a save over
    return [];
  }
}

export function readLocalVersion(docId: string, versionId: string): string | null {
  return listLocalVersions(docId).find((version) => version.id === versionId)?.content ?? null;
}

export function clearLocalVersions(docId: string): void {
  localStorage.removeItem(key(docId));
}

/**
 * Write `versions`, dropping the oldest until it fits. localStorage is a few
 * megabytes shared with the documents themselves, so history gives way rather
 * than pushing a save over the limit.
 */
function persist(docId: string, versions: LocalVersion[]): boolean {
  for (let keep = versions.length; keep > 0; keep--) {
    try {
      localStorage.setItem(key(docId), JSON.stringify(versions.slice(0, keep)));
      return true;
    } catch {
      continue;
    }
  }
  try {
    localStorage.removeItem(key(docId));
  } catch { /* nothing more to give up */ }
  return false;
}

interface SerializedNode {
  type?: string;
  text?: string;
  children?: SerializedNode[];
}

/** Anything a reader would notice: text, or a node that isn't just a wrapper */
function hasSubstance(node: SerializedNode): boolean {
  if (typeof node.text === 'string' && node.text.length > 0) return true;
  if (node.type && !['root', 'paragraph', 'linebreak'].includes(node.type)) return true;
  return (node.children ?? []).some(hasSubstance);
}

/**
 * An editor state with nothing in it — a document that was just opened.
 *
 * The editor reports its state as soon as it mounts, so without this the first
 * snapshot of a new document would be the empty one, and the throttle would
 * then hold back the real content for the next five minutes.
 */
function isEmpty(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { root?: SerializedNode };
    return !(parsed.root?.children ?? []).some(hasSubstance);
  } catch {
    // Unreadable rather than empty: keep it, so nothing is silently dropped
    return false;
  }
}

/**
 * Snapshot `content` if the newest snapshot is old enough and the document has
 * actually changed. Returns whether one was taken.
 */
export function recordLocalVersion(docId: string, content: string, now = Date.now()): boolean {
  const versions = listLocalVersions(docId);
  const newest = versions[0];

  // Don't start a history with an empty document. Once there is one, an empty
  // state is a real edit — someone cleared the document — and is kept.
  if (!newest && isEmpty(content)) return false;

  if (newest) {
    if (now - newest.createdAt < LOCAL_VERSION_INTERVAL_MS) return false;
    if (newest.content === content) return false;
  }

  const version: LocalVersion = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    content,
  };
  return persist(docId, [version, ...versions].slice(0, MAX_LOCAL_VERSIONS));
}
