import { Router } from 'express';
import { z } from 'zod';
import query from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { hocuspocusServer } from '../hocuspocus.js';
import { redis, docBufferKey } from '../redis.js';
import { listVersions, reconstructVersion } from '../versions.js';
import type { Request } from 'express';

/**
 * Disconnect anyone still editing a document whose state just changed.
 * onLoadDocument refuses trashed documents, so clients can't reconnect; the
 * disconnect itself persists each session's final state, which is what a
 * later restore should bring back.
 */
function endCollabSessions(docId: string): void {
  hocuspocusServer.closeConnections(docId);
}

/** Drop a destroyed document's buffered Yjs state so nothing is left behind */
async function discardBufferedState(docId: string): Promise<void> {
  try {
    await redis.del(docBufferKey(docId));
  } catch (err) {
    // A stale buffer can't recreate a deleted row; the flush scheduler clears it
    console.error(`Failed to clear buffered state for ${docId}:`, err);
  }
}

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const CreateDocSchema = z.object({
  title: z.string().min(1).max(500).default('Untitled'),
});

const UpdateDocSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
  })
  // An update that changes nothing must not bump updated_at and reorder the list
  .refine((body) => body.title !== undefined, { message: 'Provide at least one field to update' });

/** How many documents a page holds when the caller doesn't say */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// ?trash=true lists the trash instead of the active documents
const ListQuerySchema = z.object({
  trash: z.enum(['true', 'false']).optional(),
  /** Title search; matched anywhere in the title, case-insensitively */
  q: z.string().trim().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque: where the previous page stopped, from the Link header */
  cursor: z.string().max(200).optional(),
});

interface Cursor {
  /** The sort timestamp of the last row on the previous page */
  at: string;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.at}|${cursor.id}`, 'utf8').toString('base64url');
}

/** Rejects anything we didn't issue rather than letting it reach PostgreSQL */
function decodeCursor(raw: string): Cursor {
  const [at, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (!at || !id || Number.isNaN(Date.parse(at)) || !z.string().uuid().safeParse(id).success) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ['cursor'],
      message: 'Invalid cursor',
    }]);
  }
  return { at, id };
}

/**
 * `%` and `_` are wildcards to LIKE, so a title search for "100%" would match
 * far more than the user asked for. The query itself is parameterised; this is
 * about what the pattern means, not about injection.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Document ids are UUIDs; without this an id like "abc" reaches PostgreSQL
// and comes back as a 500 instead of a validation error.
const DocIdSchema = z.object({
  id: z.string().uuid(),
});

const VersionParamsSchema = DocIdSchema.extend({
  versionId: z.string().uuid(),
});

/**
 * Version history hangs off a document, so it answers 404 under exactly the
 * same conditions the document itself does: not yours, or in the trash.
 */
async function ownsActiveDocument(docId: string, userId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    'SELECT id FROM documents WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
    [docId, userId],
  );
  return result.rows.length > 0;
}

/**
 * List documents for the authenticated user, newest first, a page at a time.
 *
 * Paginated on (sort column, id) rather than OFFSET: documents are reordered
 * by every save, and an offset would let a row the reader already saw reappear
 * on the next page while another slips past unseen. The cursor travels in a
 * Link header, so the response stays the array it has always been.
 */
documentsRouter.get('/', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { trash, q, limit, cursor } = ListQuerySchema.parse(req.query);
    const trashed = trash === 'true';
    // The trash is ordered by when things were thrown away, not last edited
    const sortColumn = trashed ? 'deleted_at' : 'updated_at';
    const position = cursor ? decodeCursor(cursor) : null;
    const search = q ? `%${escapeLike(q)}%` : null;

    // What the count and the page agree on; the cursor narrows the page only
    const matching = [
      'owner_id = $1',
      `deleted_at IS ${trashed ? 'NOT NULL' : 'NULL'}`,
      `($2::text IS NULL OR title ILIKE $2 ESCAPE '\\')`,
    ];
    const filters = [...matching];
    const params: unknown[] = [userId, search];

    if (position) {
      params.push(position.at, position.id);
      filters.push(`(${sortColumn}, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }

    // One row more than asked for: its presence is what says there is a next
    // page, without a second query to find out.
    params.push(limit + 1);
    const result = await query<{
      id: string;
      title: string;
      updated_at: string;
      created_at: string;
      deleted_at: string | null;
      cursor_at: string;
    }>(
      // cursor_at is the sort timestamp as PostgreSQL holds it, to the
      // microsecond. Reading it back through a JavaScript Date would round it
      // to the millisecond, and a page boundary inside a group of documents
      // saved in the same instant would then exclude the rest of that group —
      // paging would stop early and quietly lose them.
      `SELECT id, title, updated_at, created_at, deleted_at,
              to_char(${sortColumn} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
       FROM documents
       WHERE ${filters.join(' AND ')}
       ORDER BY ${sortColumn} DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );

    const page = result.rows.slice(0, limit);
    const last = page[page.length - 1];
    if (result.rows.length > limit && last) {
      const next = new URL(req.originalUrl, `${req.protocol}://${req.get('host') ?? 'localhost'}`);
      next.searchParams.set('cursor', encodeCursor({ at: last.cursor_at, id: last.id }));
      res.setHeader('Link', `<${next.pathname}${next.search}>; rel="next"`);
    }

    // Only on the first page: counting every match costs as much as the scan
    // the pagination exists to avoid, and the total doesn't change as you page.
    if (!position) {
      const counted = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM documents WHERE ${matching.join(' AND ')}`,
        [userId, search],
      );
      res.setHeader('X-Total-Count', counted.rows[0]?.count ?? '0');
    }

    // cursor_at is bookkeeping for the Link header, not part of a document
    res.json(page.map(({ cursor_at: _cursor, ...doc }) => doc));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Get a single document
documentsRouter.get('/:id', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id } = DocIdSchema.parse(req.params);
    const result = await query<{
      id: string;
      title: string;
      yjs_state: Buffer | null;
      updated_at: string;
    }>(
      `SELECT id, title, yjs_state, updated_at
       FROM documents
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );

    const doc = result.rows[0];
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json({
      id: doc.id,
      title: doc.title,
      yjsState: doc.yjs_state ? doc.yjs_state.toString('base64') : null,
      updatedAt: doc.updated_at,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// A document's version history, newest first. Only metadata — each version's
// content is a separate request, since rebuilding one is not free.
documentsRouter.get('/:id/versions', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id } = DocIdSchema.parse(req.params);

    if (!(await ownsActiveDocument(id, userId))) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const versions = await listVersions(id);
    res.json(
      versions.map((version) => ({
        id: version.id,
        createdAt: version.createdAt.toISOString(),
        sizeBytes: version.sizeBytes,
      })),
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// The document's full state as of one version, for the client to show and
// restore from. Base64 like GET /:id, so both speak the same currency.
documentsRouter.get('/:id/versions/:versionId', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id, versionId } = VersionParamsSchema.parse(req.params);

    if (!(await ownsActiveDocument(id, userId))) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const state = await reconstructVersion(id, versionId);
    if (!state) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    res.json({ id: versionId, yjsState: state.toString('base64') });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Create a document
documentsRouter.post('/', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const body = CreateDocSchema.parse(req.body);

    const result = await query<{ id: string; title: string; created_at: string }>(
      `INSERT INTO documents (title, owner_id)
       VALUES ($1, $2)
       RETURNING id, title, created_at`,
      [body.title, userId],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update document title
documentsRouter.patch('/:id', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id } = DocIdSchema.parse(req.params);
    const body = UpdateDocSchema.parse(req.body);

    const result = await query<{ id: string; title: string }>(
      `UPDATE documents
       SET title = COALESCE($1, title), updated_at = NOW()
       WHERE id = $2 AND owner_id = $3 AND deleted_at IS NULL
       RETURNING id, title`,
      [body.title, id, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Move a document to the trash. The Yjs state is kept, so a restore brings
// the document back exactly as it was.
documentsRouter.delete('/:id', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id } = DocIdSchema.parse(req.params);
    const result = await query(
      `UPDATE documents SET deleted_at = NOW()
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Nobody should keep editing a document that's left the sidebar
    endCollabSessions(id);

    res.status(204).send();
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Permanently delete a trashed document. Only reachable for documents that
// are already in the trash, so a single click can never destroy live work.
documentsRouter.delete('/:id/permanent', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id } = DocIdSchema.parse(req.params);
    const result = await query(
      `DELETE FROM documents
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
       RETURNING id`,
      [id, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found in trash' });
      return;
    }

    endCollabSessions(id);
    await discardBufferedState(id);

    res.status(204).send();
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Empty the trash
documentsRouter.delete('/', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const result = await query<{ id: string }>(
      'DELETE FROM documents WHERE owner_id = $1 AND deleted_at IS NOT NULL RETURNING id',
      [userId],
    );

    for (const row of result.rows) {
      endCollabSessions(row.id);
      await discardBufferedState(row.id);
    }

    res.json({ deleted: result.rows.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Restore a trashed document
documentsRouter.post('/:id/restore', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { id } = DocIdSchema.parse(req.params);
    const result = await query<{ id: string; title: string; updated_at: string }>(
      `UPDATE documents SET deleted_at = NULL
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
       RETURNING id, title, updated_at`,
      [id, userId],
    );

    const doc = result.rows[0];
    if (!doc) {
      res.status(404).json({ error: 'Document not found in trash' });
      return;
    }

    res.json(doc);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
