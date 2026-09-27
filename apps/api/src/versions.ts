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

export interface VersionSummary {
  id: string;
  createdAt: Date;
  /** Size of this version's delta, not of the document */
  sizeBytes: number;
}

export type RecordOutcome =
  /** A new version was written */
  | 'created'
  /** The document hasn't changed since the newest version */
  | 'unchanged'
  /** The newest version is too recent; the edits land in the next one */
  | 'too-soon';

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
  options: { force?: boolean } = {},
): Promise<RecordOutcome> {
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

  await query(
    `INSERT INTO document_versions (document_id, update_data, state_vector)
     VALUES ($1, $2, $3)`,
    [docId, delta, vector],
  );

  await pruneVersions(docId);
  return 'created';
}

/**
 * Keep the newest MAX_VERSIONS_PER_DOC versions. The deltas that fall off the
 * end are merged into the oldest surviving version instead of being dropped —
 * they are the beginning of the chain, and without them every later version
 * would rebuild a document that never existed.
 */
async function pruneVersions(docId: string): Promise<void> {
  const counted = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM document_versions WHERE document_id = $1',
    [docId],
  );
  const excess = Number(counted.rows[0]?.count ?? 0) - MAX_VERSIONS_PER_DOC;
  if (excess <= 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doomed = await client.query<{ id: string; update_data: Buffer }>(
      `SELECT id, update_data FROM document_versions
       WHERE document_id = $1 ORDER BY seq LIMIT $2`,
      [docId, excess],
    );
    const heir = await client.query<{ id: string; update_data: Buffer }>(
      `SELECT id, update_data FROM document_versions
       WHERE document_id = $1 ORDER BY seq OFFSET $2 LIMIT 1`,
      [docId, excess],
    );
    const survivor = heir.rows[0];
    if (survivor && doomed.rows.length > 0) {
      const merged = Y.mergeUpdates([
        ...doomed.rows.map((row) => new Uint8Array(row.update_data)),
        new Uint8Array(survivor.update_data),
      ]);
      await client.query('UPDATE document_versions SET update_data = $1 WHERE id = $2', [
        Buffer.from(merged),
        survivor.id,
      ]);
      await client.query('DELETE FROM document_versions WHERE id = ANY($1::uuid[])', [
        doomed.rows.map((row) => row.id),
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

/** A document's versions, newest first */
export async function listVersions(docId: string): Promise<VersionSummary[]> {
  const result = await query<{ id: string; created_at: Date; size_bytes: number }>(
    `SELECT id, created_at, LENGTH(update_data) AS size_bytes
     FROM document_versions
     WHERE document_id = $1
     ORDER BY seq DESC`,
    [docId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    sizeBytes: Number(row.size_bytes),
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
