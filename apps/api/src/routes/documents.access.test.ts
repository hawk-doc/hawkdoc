import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, signUp, createDoc, listDocs, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

describe('document access control', () => {
  it('requires a token on every document route', async () => {
    const paths: [string, 'get' | 'post' | 'patch' | 'delete'][] = [
      ['/api/documents', 'get'],
      ['/api/documents', 'post'],
      ['/api/documents', 'delete'],
      ['/api/documents/11111111-1111-1111-1111-111111111111', 'get'],
      ['/api/documents/11111111-1111-1111-1111-111111111111', 'patch'],
      ['/api/documents/11111111-1111-1111-1111-111111111111', 'delete'],
      ['/api/documents/11111111-1111-1111-1111-111111111111/permanent', 'delete'],
      ['/api/documents/11111111-1111-1111-1111-111111111111/restore', 'post'],
    ];
    for (const [path, method] of paths) {
      await request(app)[method](path).expect(401);
    }
  });

  it('rejects an expired or malformed token', async () => {
    await request(app).get('/api/documents').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
    await request(app).get('/api/documents').set({ Authorization: 'token-without-bearer' }).expect(401);
  });

  it("never exposes another user's documents", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const doc = await createDoc(owner, 'Private');

    await request(app).get(`/api/documents/${doc.id}`).set(stranger.auth).expect(404);
    await request(app).patch(`/api/documents/${doc.id}`).set(stranger.auth).send({ title: 'mine now' }).expect(404);
    await request(app).delete(`/api/documents/${doc.id}`).set(stranger.auth).expect(404);
    expect(await listDocs(stranger)).toEqual([]);

    // the owner's document is untouched
    const res = await request(app).get(`/api/documents/${doc.id}`).set(owner.auth).expect(200);
    expect(res.body).toMatchObject({ title: 'Private' });
  });

  it("cannot restore or destroy another user's trashed document", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const doc = await createDoc(owner, 'Trashed');
    await request(app).delete(`/api/documents/${doc.id}`).set(owner.auth).expect(204);

    await request(app).post(`/api/documents/${doc.id}/restore`).set(stranger.auth).expect(404);
    await request(app).delete(`/api/documents/${doc.id}/permanent`).set(stranger.auth).expect(404);
    await request(app).delete('/api/documents').set(stranger.auth).expect(200);

    expect(await listDocs(owner, true)).toEqual(['Trashed']);
  });
});

describe('document input validation', () => {
  it('answers 400 for a malformed id instead of failing in PostgreSQL', async () => {
    const user = await signUp();
    await request(app).get('/api/documents/not-a-uuid').set(user.auth).expect(400);
    await request(app).patch('/api/documents/not-a-uuid').set(user.auth).send({ title: 'x' }).expect(400);
    await request(app).delete('/api/documents/not-a-uuid').set(user.auth).expect(400);
    await request(app).delete('/api/documents/not-a-uuid/permanent').set(user.auth).expect(400);
    await request(app).post('/api/documents/not-a-uuid/restore').set(user.auth).expect(400);
  });

  it('rejects titles the schema disallows', async () => {
    const user = await signUp();
    await request(app).post('/api/documents').set(user.auth).send({ title: '' }).expect(400);
    await request(app).post('/api/documents').set(user.auth).send({ title: 'a'.repeat(501) }).expect(400);

    const doc = await createDoc(user, 'Fine');
    await request(app).patch(`/api/documents/${doc.id}`).set(user.auth).send({ title: 'a'.repeat(501) }).expect(400);
    await request(app).patch(`/api/documents/${doc.id}`).set(user.auth).send({ title: 'a'.repeat(500) }).expect(200);
  });

  it('defaults an omitted title to Untitled', async () => {
    const user = await signUp();
    const res = await request(app).post('/api/documents').set(user.auth).send({}).expect(201);
    expect(res.body).toMatchObject({ title: 'Untitled' });
  });

  it('rejects an unknown value for ?trash', async () => {
    const user = await signUp();
    await request(app).get('/api/documents?trash=maybe').set(user.auth).expect(400);
  });
});
