import { Server } from '@hocuspocus/server';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { query } from './db.js';
import { redis, docBufferKey } from './redis.js';
import * as Y from 'yjs';

interface HocuspocusContext {
  userId: string;
}

export const hocuspocusServer = Server.configure({
  port: env.HOCUSPOCUS_PORT,

  async onAuthenticate(data) {
    const token = data.token;
    if (!token) throw new Error('Authentication required');
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      return { userId: payload.userId } satisfies HocuspocusContext;
    } catch {
      throw new Error('Invalid or expired token');
    }
  },

  async onLoadDocument(data) {
    const docId = data.documentName;
    const { userId } = data.context as HocuspocusContext;

    // 1. Check Redis buffer first (most recent state)
    const buffered = await redis.getBuffer(docBufferKey(docId));
    if (buffered) {
      // Ownership check even for cached state
      const owned = await query<{ id: string }>(
        'SELECT id FROM documents WHERE id = $1 AND owner_id = $2',
        [docId, userId],
      );
      if (!owned.rows[0]) throw new Error('Document not found or access denied');
      Y.applyUpdate(data.document, buffered);
      return;
    }

    // 2. Fall back to PostgreSQL — ownership verified by WHERE clause
    try {
      const result = await query<{ yjs_state: Buffer | null }>(
        'SELECT yjs_state FROM documents WHERE id = $1 AND owner_id = $2',
        [docId, userId],
      );
      if (!result.rows[0]) throw new Error('Document not found or access denied');
      if (result.rows[0].yjs_state) {
        Y.applyUpdate(data.document, result.rows[0].yjs_state);
      }
    } catch (err) {
      console.error(`Failed to load document ${docId}:`, err);
      throw err;
    }
  },

  async onChange(data) {
    const docId = data.documentName;

    try {
      const state = Y.encodeStateAsUpdate(data.document);
      await redis.set(docBufferKey(docId), Buffer.from(state));
    } catch (err) {
      console.error(`Failed to buffer update for ${docId}:`, err);
    }
  },

  async onDisconnect(data) {
    const docId = data.documentName;

    try {
      const state = Y.encodeStateAsUpdate(data.document);
      await query(
        `UPDATE documents SET yjs_state = $1, updated_at = NOW() WHERE id = $2`,
        [Buffer.from(state), docId],
      );
      await redis.del(docBufferKey(docId));
    } catch (err) {
      console.error(`Failed to flush on disconnect for ${docId}:`, err);
    }
  },
});
