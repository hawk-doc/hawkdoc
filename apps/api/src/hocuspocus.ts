import { Server } from '@hocuspocus/server';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import query from './db.js';
import { redis, docBufferKey, deleteBufferIfUnchanged } from './redis.js';
import * as Y from 'yjs';
import type { HocuspocusContext } from './interfaces/index.js';
import { INVALID_TOKEN_REASON } from './constants/auth.js';

class InvalidTokenError extends Error {
  // Hocuspocus forwards `reason` to the client's onAuthenticationFailed
  readonly reason = INVALID_TOKEN_REASON;
}

// Shutdown can't rely on destroy() alone: it resolves once documents unload,
// and with several clients on one document the first finished onDisconnect can
// unload it while the others are still writing. Track the writes so shutdown
// can wait for them before closing Redis and the pg pool.
const pendingDisconnectWrites = new Set<Promise<void>>();

export async function waitForDisconnectWrites(): Promise<void> {
  await Promise.allSettled([...pendingDisconnectWrites]);
}

async function persistOnDisconnect(docId: string, document: Y.Doc): Promise<void> {
  try {
    // Read the buffer before encoding: everything in it is included in the
    // state we write, so it's safe to drop — unless another client changed
    // the document meanwhile, in which case the newer buffer is kept.
    const buffered = await redis.getBuffer(docBufferKey(docId));
    const state = Y.encodeStateAsUpdate(document);
    await query(
      `UPDATE documents SET yjs_state = $1, updated_at = NOW() WHERE id = $2`,
      [Buffer.from(state), docId],
    );
    if (buffered) await deleteBufferIfUnchanged(docId, buffered);
  } catch (err) {
    console.error(`Failed to flush on disconnect for ${docId}:`, err);
  }
}

export const hocuspocusServer = Server.configure({
  port: env.HOCUSPOCUS_PORT,
  // Hocuspocus's own SIGINT/SIGTERM handler calls process.exit(0) right after
  // destroy(), cutting off our Redis flush and pool shutdown. index.ts owns
  // shutdown instead and calls destroy() itself.
  stopOnSignals: false,

  async onAuthenticate(data) {
    const token = data.token;
    if (!token) throw new InvalidTokenError('Authentication required');
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      return { userId: payload.userId } satisfies HocuspocusContext;
    } catch {
      throw new InvalidTokenError('Invalid or expired token');
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
        'SELECT id FROM documents WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [docId, userId],
      );
      if (!owned.rows[0]) throw new Error('Document not found or access denied');
      Y.applyUpdate(data.document, buffered);
      return;
    }

    // 2. Fall back to PostgreSQL — ownership verified by WHERE clause
    try {
      const result = await query<{ yjs_state: Buffer | null }>(
        'SELECT yjs_state FROM documents WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
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
    const write = persistOnDisconnect(data.documentName, data.document);
    pendingDisconnectWrites.add(write);
    try {
      await write;
    } finally {
      pendingDisconnectWrites.delete(write);
    }
  },
});
