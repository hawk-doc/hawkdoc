import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import * as Y from 'yjs';
import query from '../db.js';
import { redis, docBufferKey } from '../redis.js';
import { listVersions, reconstructVersion } from '../versions.js';
import { app, signUp, createDoc, closeConnections, type TestUser } from '../test/helpers.js';

afterAll(closeConnections);

/** A Yjs state holding `text`, the shape a real document's content takes */
function stateWith(text: string): Buffer {
  const doc = new Y.Doc();
  doc.getText('t').insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

function textOf(state: Buffer | Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  return doc.getText('t').toString();
}

async function duplicate(user: TestUser, id: string, expectStatus = 201) {
  const res = await request(app)
    .post(`/api/documents/${id}/duplicate`)
    .set(user.auth)
    .expect(expectStatus);
  return res.body as { id: string; title: string };
}

async function savedState(id: string): Promise<Buffer | null> {
  const result = await query<{ yjs_state: Buffer | null }>(
    'SELECT yjs_state FROM documents WHERE id = $1', [id],
  );
  return result.rows[0]?.yjs_state ?? null;
}

describe('duplicating a document', () => {
  it('copies the content under a new name and leaves the original alone', async () => {
    const user = await signUp();
    const original = await createDoc(user, 'Quarterly report');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [stateWith('the contents'), original.id]);

    const copy = await duplicate(user, original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Copy of Quarterly report');
    expect(textOf((await savedState(copy.id))!)).toBe('the contents');

    // Editing the copy must not reach back into the original
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [stateWith('changed'), copy.id]);
    expect(textOf((await savedState(original.id))!)).toBe('the contents');
  });

  it('copies what the author last saw, not what PostgreSQL last stored', async () => {
    // Edits live in the Redis buffer for up to thirty seconds before a flush
    const user = await signUp();
    const original = await createDoc(user, 'In progress');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [stateWith('older saved text'), original.id]);
    await redis.set(docBufferKey(original.id), stateWith('what the author sees'));

    try {
      const copy = await duplicate(user, original.id);
      expect(textOf((await savedState(copy.id))!)).toBe('what the author sees');
    } finally {
      await redis.del(docBufferKey(original.id));
    }
  });

  it('gives the copy a history that starts with what it was made from', async () => {
    const user = await signUp();
    const original = await createDoc(user, 'Worth keeping');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [stateWith('first draft'), original.id]);

    const copy = await duplicate(user, original.id);

    const versions = await listVersions(copy.id);
    expect(versions).toHaveLength(1);
    expect(textOf((await reconstructVersion(copy.id, versions[0]!.id))!)).toBe('first draft');
  });

  it('duplicates a document that has never been edited', async () => {
    const user = await signUp();
    const original = await createDoc(user, 'Empty one');

    const copy = await duplicate(user, original.id);

    expect(copy.title).toBe('Copy of Empty one');
    expect(await savedState(copy.id)).toBeNull();
    expect(await listVersions(copy.id)).toEqual([]);
  });

  it('keeps the copy title within the limit the column allows', async () => {
    const user = await signUp();
    const original = await createDoc(user, 'T'.repeat(500));

    const copy = await duplicate(user, original.id);

    expect(copy.title).toHaveLength(500);
    expect(copy.title.startsWith('Copy of TTT')).toBe(true);
  });

  it('shows the copy in the document list', async () => {
    const user = await signUp();
    const original = await createDoc(user, 'Listed');
    await duplicate(user, original.id);

    const res = await request(app).get('/api/documents').set(user.auth).expect(200);
    expect((res.body as { title: string }[]).map((doc) => doc.title).sort())
      .toEqual(['Copy of Listed', 'Listed']);
  });

  it('refuses a document that is not yours, trashed, or not a document at all', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const doc = await createDoc(owner, 'Private');

    await duplicate(stranger, doc.id, 404);

    await request(app).delete(`/api/documents/${doc.id}`).set(owner.auth).expect(204);
    await duplicate(owner, doc.id, 404);

    await request(app).post('/api/documents/not-a-uuid/duplicate').set(owner.auth).expect(400);
    await request(app).post(`/api/documents/${doc.id}/duplicate`).expect(401);
  });
});
