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

/**
 * How many of them may carry a name. Named snapshots are kept when the rest
 * are trimmed, so a cap below MAX_LOCAL_VERSIONS is what stops a named
 * history from filling the quota on its own.
 */
export const MAX_NAMED_LOCAL_VERSIONS = 10;

/** Longest name a snapshot may carry, matching the server */
export const MAX_LOCAL_LABEL_LENGTH = 100;

export interface LocalVersion {
  id: string;
  createdAt: number;
  /** A serialised Lexical editor state */
  content: string;
  /** The name the reader gave it. A named snapshot is kept when trimming. */
  label?: string;
}

function key(docId: string): string {
  return `${VERSIONS_KEY_PREFIX}${docId}`;
}

/** Validate a stored snapshot, including older entries without a label. */
function isLocalVersion(value: unknown): value is LocalVersion {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  // `label` is optional: snapshots written before names existed have none
  const label = candidate['label'];
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['createdAt'] === 'number' &&
    typeof candidate['content'] === 'string' &&
    (label === undefined || typeof label === 'string')
  );
}

/**
 * Trims to MAX_LOCAL_VERSIONS by dropping the oldest **unnamed** snapshots.
 * Naming one is what keeps it, so the trim reaches past it.
 */
function trimmed(versions: LocalVersion[]): LocalVersion[] {
  if (versions.length <= MAX_LOCAL_VERSIONS) return versions;
  const excess = versions.length - MAX_LOCAL_VERSIONS;
  const doomed = new Set<string>();
  // `versions` runs newest first, so walk it backwards for the oldest
  for (let i = versions.length - 1; i >= 0 && doomed.size < excess; i--) {
    const version = versions[i]!;
    if (!version.label) doomed.add(version.id);
  }
  return versions.filter((version) => !doomed.has(version.id));
}

/** Trim and cap a snapshot name, returning undefined when it is blank. */
function cleanLabel(label: string | null | undefined): string | undefined {
  const trimmedLabel = label?.trim() ?? '';
  return trimmedLabel.length > 0 ? trimmedLabel.slice(0, MAX_LOCAL_LABEL_LENGTH) : undefined;
}

/** How many of a document's snapshots carry a name */
export function countNamedLocalVersions(docId: string): number {
  return listLocalVersions(docId).filter((version) => version.label).length;
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

  return persist(docId, trimmed([newVersion(content, now), ...versions]));
}

/** Create snapshot metadata with a generated id and an optional name. */
function newVersion(content: string, now: number, label?: string): LocalVersion {
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    content,
    ...(label ? { label } : {}),
  };
}

export type LocalSaveOutcome =
  /** A snapshot was written */
  | 'created'
  /** The document matches the newest snapshot, which took the name instead */
  | 'named-existing'
  /** This document holds as many names as it may */
  | 'too-many-names'
  /** localStorage wouldn't take it */
  | 'no-room';

/**
 * Snapshot the document now, under an optional name — what the reader gets
 * when they ask to save a version rather than waiting for the throttle.
 *
 * If the document matches the newest snapshot there is nothing new to keep,
 * so the name goes on that one instead of writing a duplicate. The server
 * behaves the same way.
 */
export function saveLocalVersion(
  docId: string,
  content: string,
  label?: string | null,
  now = Date.now(),
): LocalSaveOutcome {
  const name = cleanLabel(label);
  const versions = listLocalVersions(docId);
  const newest = versions[0];

  if (name && countNamedLocalVersions(docId) >= MAX_NAMED_LOCAL_VERSIONS) {
    return 'too-many-names';
  }

  if (newest && newest.content === content) {
    if (!name) return 'named-existing';
    const renamed = versions.map((version) =>
      version.id === newest.id ? { ...version, label: name } : version,
    );
    return persist(docId, renamed) ? 'named-existing' : 'no-room';
  }

  const next = trimmed([newVersion(content, now, name), ...versions]);
  return persist(docId, next) ? 'created' : 'no-room';
}

/**
 * Name a snapshot, or clear its name with a blank one. Returns the snapshot as
 * it now stands, or why it couldn't be named.
 */
export function nameLocalVersion(
  docId: string,
  versionId: string,
  label: string | null,
): LocalVersion | 'not-found' | 'too-many-names' | 'no-room' {
  const name = cleanLabel(label);
  const versions = listLocalVersions(docId);
  const target = versions.find((version) => version.id === versionId);
  if (!target) return 'not-found';

  // Renaming one that already has a name doesn't add to the count
  if (name && !target.label && countNamedLocalVersions(docId) >= MAX_NAMED_LOCAL_VERSIONS) {
    return 'too-many-names';
  }

  const updated: LocalVersion = name
    ? { ...target, label: name }
    : { id: target.id, createdAt: target.createdAt, content: target.content };
  const next = versions.map((version) => (version.id === versionId ? updated : version));

  // Clearing a name makes it trimmable again, and the history may have been
  // over the limit only because of it.
  return persist(docId, trimmed(next)) ? updated : 'no-room';
}
