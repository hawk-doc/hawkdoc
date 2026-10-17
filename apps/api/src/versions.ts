import * as Y from 'yjs';
import query, { pool } from './db.js';

/**
 * Version history for documents.
 *
 * A version is one row of `document_versions` holding the Yjs changes since
 * the version before it — never a full snapshot, so a long editing history
 * costs about as much as the document itself. The state at a version is the
 * merge of every delta up to and including it, which is what
 * `reconstructVersion` returns.
 */

/** A version is recorded at most this often while a document is being edited */
export const VERSION_INTERVAL_MS = 5 * 60_000;

/** How many versions a document keeps; older ones are folded into the oldest */
export const MAX_VERSIONS_PER_DOC = 50;

/**
 * How many versions of one document may carry a name.
 *
 * Named versions are exempt from pruning, so without a cap a reader who named
 * every version would have a history that grows forever. Keeping this below
 * MAX_VERSIONS_PER_DOC also guarantees pruning can always reach the limit:
 * there are then always unnamed versions left to drop.
 */
export const MAX_NAMED_VERSIONS = 20;

/** Longest name a version may carry */
export const MAX_LABEL_LENGTH = 100;

export interface VersionSummary {
  id: string;
  createdAt: Date;
  /** Size of this version's delta, not of the document */
  sizeBytes: number;
  /** The name the reader gave it, if any. A named version is never pruned. */
  label: string | null;
}

export type RecordOutcome =
  /** A new version was written */
  | 'created'
  /** The document hasn't changed since the newest version */
  | 'unchanged'
  /** The newest version is too recent; the edits land in the next one */
  | 'too-soon'
  /** The document was deleted while its last state was being written */
  | 'no-document'
  /** This document already has as many named versions as it may have */
  | 'too-many-names';

interface LatestRow {
  state_vector: Buffer | null;
  created_at: Date;
}

async function newestVersion(docId: string): Promise<LatestRow | undefined> {
  const result = await query<LatestRow>(
    `SELECT state_vector, created_at
     FROM document_versions
     WHERE document_id = $1
     ORDER BY seq DESC
     LIMIT 1`,
    [docId],
  );
  return result.rows[0];
}

/**
 * Two encodings of the same state vector aren't guaranteed to be the same
 * bytes — the clients can be written in a different order — so compare what
 * they mean rather than how they were encoded. Otherwise reopening a document
 * and closing it again would record a version containing nothing.
 */
function sameState(a: Buffer, b: Buffer): boolean {
  const left = Y.decodeStateVector(a);
  const right = Y.decodeStateVector(b);
  if (left.size !== right.size) return false;
  for (const [client, clock] of left) {
    if (right.get(client) !== clock) return false;
  }
  return true;
}

/**
 * Record `state` (a document's full Yjs state) as a version, storing only what
 * changed since the last one.
 *
 * Throttled to `VERSION_INTERVAL_MS` so a document saved every 30 seconds
 * doesn't collect a version every 30 seconds. Pass `force` at the end of an
 * editing session, where the last state is worth keeping whatever the clock
 * says.
 */
export async function recordVersion(
  docId: string,
  state: Buffer,
  options: { force?: boolean; label?: string } = {},
): Promise<RecordOutcome> {
  const label = options.label?.trim() ?? '';
  if (label.length > 0 && (await countNamedVersions(docId)) >= MAX_NAMED_VERSIONS) {
    return 'too-many-names';
  }

  const newest = await newestVersion(docId);

  if (newest && !options.force && Date.now() - newest.created_at.getTime() < VERSION_INTERVAL_MS) {
    return 'too-soon';
  }

  const vector = Buffer.from(Y.encodeStateVectorFromUpdate(state));
  let delta = state;

  // A version predating this feature has no state vector, so there is nothing
  // to diff against: store the whole state. Merging it over the older deltas
  // still reconstructs correctly, since a full state carries its own history.
  if (newest?.state_vector) {
    if (sameState(newest.state_vector, vector)) return 'unchanged';
    delta = Buffer.from(Y.diffUpdate(state, newest.state_vector));
  }

  // INSERT ... SELECT rather than VALUES: closing a permanently deleted
  // document's editing sessions writes its final state, and by then the row is
  // gone. This records nothing instead of failing the foreign key.
  const inserted = await query(
    `INSERT INTO document_versions (document_id, update_data, state_vector, label)
     SELECT id, $2, $3, $4 FROM documents WHERE id = $1`,
    [docId, delta, vector, label.length > 0 ? label.slice(0, MAX_LABEL_LENGTH) : null],
  );
  if (inserted.rowCount === 0) return 'no-document';

  await pruneVersions(docId);
  return 'created';
}

/**
 * Keep the newest MAX_VERSIONS_PER_DOC versions, dropping only unnamed ones.
 *
 * A dropped delta is merged into the first version that survives after it,
 * never deleted: the deltas are a chain, and the state at a version is the
 * merge of everything up to it. Merging into the *immediate* surviving
 * successor is what makes a named version safe to keep mid-chain — folding
 * everything into the oldest survivor instead would move changes past a named
 * version, and it would then rebuild a document that never existed.
 */
async function pruneVersions(docId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialise prunes of one document, and count under the lock: two racing
    // calls would otherwise both act on the same stale count, and the second
    // would delete a version more than the limit requires.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [docId]);

    // Ids and names only — the deltas are fetched once the plan is known
    const rows = await client.query<{ id: string; named: boolean }>(
      `SELECT id, label IS NOT NULL AS named FROM document_versions
       WHERE document_id = $1 ORDER BY seq`,
      [docId],
    );
    const excess = rows.rows.length - MAX_VERSIONS_PER_DOC;
    if (excess <= 0) {
      await client.query('COMMIT');
      return;
    }

    // The oldest unnamed versions, up to the number that has to go. A named
    // one is skipped over rather than ending the search, so a name near the
    // start of the history doesn't stop pruning the rest of it.
    const doomed = new Set<string>();
    for (const row of rows.rows) {
      if (doomed.size === excess) break;
      if (!row.named) doomed.add(row.id);
    }
    if (doomed.size === 0) {
      // Every version is named. The cap yields to the names; MAX_NAMED_VERSIONS
      // is what stops that growing without bound.
      await client.query('COMMIT');
      return;
    }

    // Each run of doomed versions merges into the next survivor after it
    const groups: { target: string; members: string[] }[] = [];
    let pending: string[] = [];
    for (const row of rows.rows) {
      if (doomed.has(row.id)) {
        pending.push(row.id);
        continue;
      }
      if (pending.length > 0) {
        groups.push({ target: row.id, members: pending });
        pending = [];
      }
    }
    // Anything still pending has no survivor after it, so there is nowhere for
    // its changes to go. Leave those versions alone rather than lose them.
    for (const orphan of pending) doomed.delete(orphan);

    for (const group of groups) {
      const deltas = await client.query<{ id: string; update_data: Buffer }>(
        `SELECT id, update_data FROM document_versions
         WHERE id = ANY($1::uuid[]) ORDER BY seq`,
        [[...group.members, group.target]],
      );
      const merged = Y.mergeUpdates(deltas.rows.map((row) => new Uint8Array(row.update_data)));
      await client.query('UPDATE document_versions SET update_data = $1 WHERE id = $2', [
        Buffer.from(merged),
        group.target,
      ]);
      await client.query('DELETE FROM document_versions WHERE id = ANY($1::uuid[])', [
        group.members,
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** How many of a document's versions carry a name */
export async function countNamedVersions(docId: string): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM document_versions WHERE document_id = $1 AND label IS NOT NULL',
    [docId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Name a version, or clear its name by passing null. Naming it exempts it from
 * pruning, so the cap applies here too.
 *
 * Returns the version as it now stands, 'not-found' if it isn't this
 * document's, or 'too-many-names' if the document has used up its names.
 */
export async function nameVersion(
  docId: string,
  versionId: string,
  label: string | null,
): Promise<VersionSummary | 'not-found' | 'too-many-names'> {
  const trimmed = label?.trim() ?? '';
  const next = trimmed.length > 0 ? trimmed.slice(0, MAX_LABEL_LENGTH) : null;

  if (next !== null) {
    const existing = await query<{ label: string | null }>(
      'SELECT label FROM document_versions WHERE id = $1 AND document_id = $2',
      [versionId, docId],
    );
    const current = existing.rows[0];
    if (!current) return 'not-found';
    // Renaming one that is already named doesn't add to the count
    if (current.label === null && (await countNamedVersions(docId)) >= MAX_NAMED_VERSIONS) {
      return 'too-many-names';
    }
  }

  const result = await query<{ id: string; created_at: Date; size_bytes: number; label: string | null }>(
    `UPDATE document_versions SET label = $3
     WHERE id = $1 AND document_id = $2
     RETURNING id, created_at, LENGTH(update_data) AS size_bytes, label`,
    [versionId, docId, next],
  );
  const row = result.rows[0];
  if (!row) return 'not-found';

  // Clearing a name makes the version prunable again, and the document may
  // have been over the limit only because of it.
  if (next === null) await pruneVersions(docId);

  return {
    id: row.id,
    createdAt: row.created_at,
    sizeBytes: Number(row.size_bytes),
    label: row.label,
  };
}

/** A document's versions, newest first */
export async function listVersions(docId: string): Promise<VersionSummary[]> {
  const result = await query<{ id: string; created_at: Date; size_bytes: number; label: string | null }>(
    `SELECT id, created_at, LENGTH(update_data) AS size_bytes, label
     FROM document_versions
     WHERE document_id = $1
     ORDER BY seq DESC`,
    [docId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    sizeBytes: Number(row.size_bytes),
    label: row.label,
  }));
}

/**
 * The document's full Yjs state as of `versionId`, or null if that version
 * doesn't belong to this document.
 */
export async function reconstructVersion(
  docId: string,
  versionId: string,
): Promise<Buffer | null> {
  const result = await query<{ update_data: Buffer }>(
    `SELECT update_data FROM document_versions
     WHERE document_id = $1
       AND seq <= (SELECT seq FROM document_versions WHERE id = $2 AND document_id = $1)
     ORDER BY seq`,
    [docId, versionId],
  );
  if (result.rows.length === 0) return null;

  const merged = Y.mergeUpdates(result.rows.map((row) => new Uint8Array(row.update_data)));
  return Buffer.from(merged);
}

/**
 * Record a version as part of saving a document. History is secondary to the
 * save itself, so a failure here is logged and swallowed rather than allowed
 * to fail the write that triggered it.
 */
export async function tryRecordVersion(
  docId: string,
  state: Buffer,
  options: { force?: boolean } = {},
): Promise<void> {
  try {
    await recordVersion(docId, state, options);
  } catch (err) {
    console.error(`Failed to record a version for ${docId}:`, err);
  }
}
