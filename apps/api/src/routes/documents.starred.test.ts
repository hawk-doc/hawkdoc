import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import query from '../db.js';
import { app, signUp, createDoc, closeConnections, type TestUser } from '../test/helpers.js';

afterAll(closeConnections);

const star = (user: TestUser, id: string, starred: boolean) =>
  request(app).patch(`/api/documents/${id}`).set(user.auth).send({ starred });

async function titles(user: TestUser, path: string): Promise<string[]> {
  const res = await request(app).get(path).set(user.auth).expect(200);
  return (res.body as { title: string }[]).map((doc) => doc.title);
}

async function readUpdatedAt(user: TestUser, id: string): Promise<string> {
  const res = await request(app).get(`/api/documents/${id}`).set(user.auth).expect(200);
  return (res.body as { updatedAt: string }).updatedAt;
}

describe('starred documents', () => {
  it('starts unstarred and reports the flag everywhere a document is returned', async () => {
    const user = await signUp();
    const created = await request(app)
      .post('/api/documents').set(user.auth).send({ title: 'Fresh' }).expect(201);
    expect(created.body).toMatchObject({ starred: false });

    const id = (created.body as { id: string }).id;
    expect((await request(app).get(`/api/documents/${id}`).set(user.auth).expect(200)).body)
      .toMatchObject({ starred: false });

    const list = await request(app).get('/api/documents').set(user.auth).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ starred: false })]);
  });

  it('stars and unstars a document', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Keep me close');

    expect((await star(user, doc.id, true).expect(200)).body).toMatchObject({ starred: true });
    expect(await titles(user, '/api/documents?starred=true')).toEqual(['Keep me close']);

    expect((await star(user, doc.id, false).expect(200)).body).toMatchObject({ starred: false });
    expect(await titles(user, '/api/documents?starred=true')).toEqual([]);
  });

  it('leaves updated_at alone, so starring does not reorder the list', async () => {
    const user = await signUp();
    const older = await createDoc(user, 'Older');
    await query(`UPDATE documents SET updated_at = NOW() - interval '1 hour' WHERE id = $1`, [older.id]);
    await createDoc(user, 'Newer');

    const before = await readUpdatedAt(user, older.id);
    await star(user, older.id, true).expect(200);

    // Starring is not an edit: the document stays where it was in the list
    expect(await readUpdatedAt(user, older.id)).toBe(before);
    expect(await titles(user, '/api/documents')).toEqual(['Newer', 'Older']);

    // Renaming it is an edit, and does move it
    await request(app).patch(`/api/documents/${older.id}`).set(user.auth)
      .send({ title: 'Older, renamed' }).expect(200);
    expect(await titles(user, '/api/documents')).toEqual(['Older, renamed', 'Newer']);
  });

  it('keeps starred documents in the main list as well', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Starred one');
    await createDoc(user, 'Plain one');
    await star(user, doc.id, true).expect(200);

    expect((await titles(user, '/api/documents')).sort()).toEqual(['Plain one', 'Starred one']);
  });

  it('searches and counts within the starred documents', async () => {
    const user = await signUp();
    for (const title of ['Budget notes', 'Budget plan', 'Holiday']) {
      const doc = await createDoc(user, title);
      if (title.startsWith('Budget')) await star(user, doc.id, true).expect(200);
    }

    const res = await request(app).get('/api/documents?starred=true&q=plan').set(user.auth).expect(200);
    expect((res.body as { title: string }[]).map((d) => d.title)).toEqual(['Budget plan']);
    expect(res.headers['x-total-count']).toBe('1');
  });

  it('pages the starred documents on the same cursor as the full list', async () => {
    const user = await signUp();
    for (let i = 0; i < 4; i++) {
      await query(
        `INSERT INTO documents (owner_id, title, starred, updated_at)
         VALUES ($1, $2, TRUE, NOW() - ($3 || ' minutes')::interval)`,
        [user.id, `Star ${i}`, i],
      );
    }

    const first = await request(app).get('/api/documents?starred=true&limit=2').set(user.auth).expect(200);
    expect((first.body as { title: string }[]).map((d) => d.title)).toEqual(['Star 0', 'Star 1']);

    const next = /<([^>]+)>;\s*rel="next"/.exec(first.headers['link'] ?? '')?.[1];
    expect(next).toBeTruthy();
    const second = await request(app).get(next!).set(user.auth).expect(200);
    expect((second.body as { title: string }[]).map((d) => d.title)).toEqual(['Star 2', 'Star 3']);
  });

  it('keeps a star through the trash and back', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Trashed but starred');
    await star(user, doc.id, true).expect(200);

    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(204);
    // A starred document in the trash is still in the trash
    expect(await titles(user, '/api/documents?starred=true')).toEqual([]);
    expect(await titles(user, '/api/documents?trash=true')).toEqual(['Trashed but starred']);

    await request(app).post(`/api/documents/${doc.id}/restore`).set(user.auth).expect(200);
    expect(await titles(user, '/api/documents?starred=true')).toEqual(['Trashed but starred']);
  });

  it('refuses to star a document that is not yours, or in the trash', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const doc = await createDoc(owner, 'Private');

    await star(stranger, doc.id, true).expect(404);
    await request(app).delete(`/api/documents/${doc.id}`).set(owner.auth).expect(204);
    await star(owner, doc.id, true).expect(404);
  });

  it('rejects a starred flag that is not a boolean', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Validated');
    await request(app).patch(`/api/documents/${doc.id}`).set(user.auth).send({ starred: 'yes' }).expect(400);
    await request(app).patch(`/api/documents/${doc.id}`).set(user.auth).send({}).expect(400);
  });

  it('does not copy a star onto a duplicate', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Original');
    await star(user, doc.id, true).expect(200);

    const copy = await request(app).post(`/api/documents/${doc.id}/duplicate`).set(user.auth).expect(201);
    expect(copy.body).toMatchObject({ title: 'Copy of Original', starred: false });
  });

  it('ignores ?starred=true on the trash', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Thrown away');
    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(204);

    expect(await titles(user, '/api/documents?trash=true&starred=true')).toEqual(['Thrown away']);
  });
});
