import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import type { Request } from 'express';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const CreateDocSchema = z.object({
  title: z.string().min(1).max(500).default('Untitled'),
});

const UpdateDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
});

// List documents for the authenticated user
documentsRouter.get('/', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const result = await query<{
      id: string;
      title: string;
      updated_at: string;
      created_at: string;
    }>(
      `SELECT id, title, updated_at, created_at
       FROM documents
       WHERE owner_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single document
documentsRouter.get('/:id', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const result = await query<{
      id: string;
      title: string;
      yjs_state: Buffer | null;
      updated_at: string;
    }>(
      `SELECT id, title, yjs_state, updated_at
       FROM documents
       WHERE id = $1 AND owner_id = $2`,
      [req.params['id'], userId],
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
    const body = UpdateDocSchema.parse(req.body);

    const result = await query<{ id: string; title: string }>(
      `UPDATE documents
       SET title = COALESCE($1, title), updated_at = NOW()
       WHERE id = $2 AND owner_id = $3
       RETURNING id, title`,
      [body.title, req.params['id'], userId],
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

// Delete a document
documentsRouter.delete('/:id', async (req: Request, res) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const result = await query(
      'DELETE FROM documents WHERE id = $1 AND owner_id = $2 RETURNING id',
      [req.params['id'], userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
