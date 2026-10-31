import { describe, it, expect, afterAll } from 'vitest';
import * as Y from 'yjs';
import query from './db.js';
import {
  persistOnDisconnect,
  persistDocState,
  bufferDocState,
  hocuspocusServer,
  BUFFER_DEBOUNCE_MS,
  BUFFER_MAX_DEBOUNCE_MS,
} from './hocuspocus.js';
import { redis, docBufferKey } from './redis.js';
import { signUp, createDoc, closeConnections } from './test/helpers.js';

afterAll(closeConnections);

async function readDoc(id: string): Promise<{ yjs_state: Buffer | null; updated_at: Date }> {
  const { rows } = await query<{ yjs_state: Buffer | null; updated_at: Date }>(
    'SELECT yjs_state, updated_at FROM documents WHERE id = $1',
    [id],
  );
  return rows[0]!;
}

describe('persistOnDisconnect', () => {
  it('keeps updated_at when the session changed nothing', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Untouched');

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    await persistOnDisconnect(id, doc);
    const saved = await readDoc(id);

    // Backdate so a bump is detectable, then reconnect with the stored state
    await query(`UPDATE documents SET updated_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [id]);
    const before = await readDoc(id);
    const reopened = new Y.Doc();
    Y.applyUpdate(reopened, saved.yjs_state!);
    await persistOnDisconnect(id, reopened);

    const after = await readDoc(id);
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it('bumps updated_at when the session edited the document', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Edited');

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    await persistOnDisconnect(id, doc);
    await query(`UPDATE documents SET updated_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [id]);
    const before = await readDoc(id);

    doc.getText('t').insert(5, ' world');
    await persistOnDisconnect(id, doc);

    const after = await readDoc(id);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    const stored = new Y.Doc();
    Y.applyUpdate(stored, after.yjs_state!);
    expect(stored.getText('t').toString()).toBe('hello world');
  });
});

describe('persistDocState', () => {
  it('keeps updated_at when the buffered state is already stored', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Flushed');

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    const update = Buffer.from(Y.encodeStateAsUpdate(doc));
    await persistDocState(id, update);
    await query(`UPDATE documents SET updated_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [id]);
    const before = await readDoc(id);

    await persistDocState(id, update);

    const after = await readDoc(id);
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it('bumps updated_at when the buffered state is new', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Changed');

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    await persistDocState(id, Buffer.from(Y.encodeStateAsUpdate(doc)));
    await query(`UPDATE documents SET updated_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [id]);
    const before = await readDoc(id);

    doc.getText('t').insert(5, '!');
    await persistDocState(id, Buffer.from(Y.encodeStateAsUpdate(doc)));

    const after = await readDoc(id);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });
});

describe('bufferDocState', () => {
  it('writes the full document state to the Redis buffer', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Buffered');

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    await bufferDocState(id, doc);

    const buffered = await redis.getBuffer(docBufferKey(id));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, buffered!);
    expect(restored.getText('t').toString()).toBe('hello');
    await redis.del(docBufferKey(id));
  });

  it('coalesces store calls instead of buffering on every change', () => {
    expect(hocuspocusServer.configuration.debounce).toBe(BUFFER_DEBOUNCE_MS);
    expect(hocuspocusServer.configuration.maxDebounce).toBe(BUFFER_MAX_DEBOUNCE_MS);
  });
});
