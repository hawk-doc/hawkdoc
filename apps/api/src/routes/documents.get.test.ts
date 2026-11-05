import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import * as Y from 'yjs';
import query from '../db.js';
import { redis, docBufferKey } from '../redis.js';
import { app, signUp, createDoc, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

function stateWith(text: string): Buffer {
  const doc = new Y.Doc();
  doc.getText('t').insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

function textOf(base64: string): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(base64, 'base64')));
  return doc.getText('t').toString();
}

async function fetchState(user: Awaited<ReturnType<typeof signUp>>, id: string): Promise<string> {
  const res = await request(app).get(`/api/documents/${id}`).set(user.auth).expect(200);
  return (res.body as { yjsState: string }).yjsState;
}

describe('GET /api/documents/:id content', () => {
  it('returns the saved state when nothing is buffered', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Saved');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [stateWith('saved text'), doc.id]);

    expect(textOf(await fetchState(user, doc.id))).toBe('saved text');
  });

  it('returns what the author last saw, not what PostgreSQL last stored', async () => {
    // Edits live in the Redis buffer for up to thirty seconds before a flush
    const user = await signUp();
    const doc = await createDoc(user, 'In progress');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [stateWith('older saved text'), doc.id]);
    await redis.set(docBufferKey(doc.id), stateWith('what the author sees'));

    try {
      expect(textOf(await fetchState(user, doc.id))).toBe('what the author sees');
    } finally {
      await redis.del(docBufferKey(doc.id));
    }
  });
});
