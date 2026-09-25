import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, signUp, createDoc, listDocs, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

describe('document trash', () => {
  it('hides trashed documents from the list and shows them under ?trash=true', async () => {
    const user = await signUp();
    await createDoc(user, 'Keep me');
    const doomed = await createDoc(user, 'Trash me');

    await request(app).delete(`/api/documents/${doomed.id}`).set(user.auth).expect(204);

    expect(await listDocs(user)).toEqual(['Keep me']);
    expect(await listDocs(user, true)).toEqual(['Trash me']);
  });

  it('restores a trashed document', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Restore me');
    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(204);

    const res = await request(app).post(`/api/documents/${doc.id}/restore`).set(user.auth).expect(200);
    expect(res.body).toMatchObject({ id: doc.id, title: 'Restore me' });

    expect(await listDocs(user)).toContain('Restore me');
    expect(await listDocs(user, true)).toEqual([]);
  });

  it('keeps a trashed document out of the single-document routes', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Hidden');
    await request(app).get(`/api/documents/${doc.id}`).set(user.auth).expect(200);

    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(204);

    await request(app).get(`/api/documents/${doc.id}`).set(user.auth).expect(404);
    await request(app).patch(`/api/documents/${doc.id}`).set(user.auth).send({ title: 'nope' }).expect(404);
    expect(await listDocs(user, true)).toEqual(['Hidden']);
  });

  it('refuses to trash or restore twice', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Once');

    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(204);
    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(404);

    await request(app).post(`/api/documents/${doc.id}/restore`).set(user.auth).expect(200);
    await request(app).post(`/api/documents/${doc.id}/restore`).set(user.auth).expect(404);
  });

  it('only deletes permanently from the trash', async () => {
    const user = await signUp();
    const doc = await createDoc(user, 'Doomed');

    // live documents can't be destroyed in one step
    await request(app).delete(`/api/documents/${doc.id}/permanent`).set(user.auth).expect(404);
    expect(await listDocs(user)).toContain('Doomed');

    await request(app).delete(`/api/documents/${doc.id}`).set(user.auth).expect(204);
    await request(app).delete(`/api/documents/${doc.id}/permanent`).set(user.auth).expect(204);

    expect(await listDocs(user)).not.toContain('Doomed');
    expect(await listDocs(user, true)).toEqual([]);
  });

  it('empties the trash without touching active documents', async () => {
    const user = await signUp();
    const keep = await createDoc(user, 'Survivor');
    const a = await createDoc(user, 'Bulk one');
    const b = await createDoc(user, 'Bulk two');
    await request(app).delete(`/api/documents/${a.id}`).set(user.auth).expect(204);
    await request(app).delete(`/api/documents/${b.id}`).set(user.auth).expect(204);

    const res = await request(app).delete('/api/documents').set(user.auth).expect(200);
    expect(res.body).toEqual({ deleted: 2 });

    expect(await listDocs(user, true)).toEqual([]);
    expect(await listDocs(user)).toEqual(['Survivor']);
    await request(app).get(`/api/documents/${keep.id}`).set(user.auth).expect(200);
  });
});
