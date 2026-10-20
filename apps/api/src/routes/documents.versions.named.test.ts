import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import * as Y from 'yjs';
import query from '../db.js';
import { redis, docBufferKey } from '../redis.js';
import { app, signUp, createDoc, closeConnections, type TestUser } from '../test/helpers.js';
import { MAX_NAMED_VERSIONS, MAX_LABEL_LENGTH } from '../versions.js';

afterAll(closeConnections);

interface VersionRow {
  id: string;
  createdAt: string;
  sizeBytes: number;
  label: string | null;
}

/** A document whose saved state holds `text` */
async function docWithState(user: TestUser, title: string, text: string): Promise<string> {
  const { id } = await createDoc(user, title);
  const doc = new Y.Doc();
  doc.getText('t').insert(0, text);
  await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [
    Buffer.from(Y.encodeStateAsUpdate(doc)),
    id,
  ]);
  return id;
}

const save = (user: TestUser, docId: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/documents/${docId}/versions`).set(user.auth).send(body);

const rename = (user: TestUser, docId: string, versionId: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/documents/${docId}/versions/${versionId}`).set(user.auth).send(body);

async function versions(user: TestUser, docId: string): Promise<VersionRow[]> {
  const res = await request(app).get(`/api/documents/${docId}/versions`).set(user.auth).expect(200);
  return res.body as VersionRow[];
}

describe('POST /api/documents/:id/versions', () => {
  it('saves a version now, under a name', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Saved', 'the first draft');

    const res = await save(user, docId, { label: 'First draft' }).expect(201);
    expect(res.body).toMatchObject({ label: 'First draft' });

    expect(await versions(user, docId)).toEqual([
      expect.objectContaining({ label: 'First draft' }),
    ]);
  });

  it('saves one without a name', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Unnamed', 'something');

    await save(user, docId).expect(201);
    expect(await versions(user, docId)).toEqual([expect.objectContaining({ label: null })]);
  });

  it('ignores the throttle, because the reader asked for this one', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Twice', 'one');

    await save(user, docId, { label: 'one' }).expect(201);

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'one and two');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [
      Buffer.from(Y.encodeStateAsUpdate(doc)),
      docId,
    ]);

    // The automatic throttle is five minutes; this must not wait for it
    await save(user, docId, { label: 'two' }).expect(201);
    expect((await versions(user, docId)).map((v) => v.label)).toEqual(['two', 'one']);
  });

  it('names the newest version instead of writing an identical one', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Same again', 'unchanged text');

    const first = await save(user, docId).expect(201);

    // Nothing has changed, so there is nothing new to record — the name
    // belongs on the version that already holds this state
    const second = await save(user, docId, { label: 'Worth keeping' }).expect(200);
    expect(second.body).toMatchObject({
      id: (first.body as VersionRow).id,
      label: 'Worth keeping',
    });
    expect(await versions(user, docId)).toHaveLength(1);
  });

  it('prefers the buffered state over the saved one', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Buffered', 'what postgres has');

    const buffered = new Y.Doc();
    buffered.getText('t').insert(0, 'what the author last saw');
    await redis.set(docBufferKey(docId), Buffer.from(Y.encodeStateAsUpdate(buffered)));

    const res = await save(user, docId, { label: 'latest' }).expect(201);
    const versionId = (res.body as VersionRow).id;

    const content = await request(app)
      .get(`/api/documents/${docId}/versions/${versionId}`)
      .set(user.auth)
      .expect(200);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(Buffer.from((content.body as { yjsState: string }).yjsState, 'base64')));
    expect(doc.getText('t').toString()).toBe('what the author last saw');

    await redis.del(docBufferKey(docId));
  });

  it('refuses when there is nothing to save yet, and says which refusal it is', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Never edited');
    const res = await save(user, id, { label: 'empty' }).expect(409);
    // A caller saving a recovery point has to tell this apart from the cap:
    // an empty document has nothing to recover, a full one does
    expect(res.body).toMatchObject({ code: 'nothing-to-save' });
  });

  it('refuses once the document holds all the names it can', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Full', 'start');

    for (let i = 0; i < MAX_NAMED_VERSIONS; i++) {
      const doc = new Y.Doc();
      doc.getText('t').insert(0, `edit ${i}`);
      await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [
        Buffer.from(Y.encodeStateAsUpdate(doc)),
        docId,
      ]);
      await save(user, docId, { label: `name ${i}` }).expect(201);
    }

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'one more');
    await query('UPDATE documents SET yjs_state = $1 WHERE id = $2', [
      Buffer.from(Y.encodeStateAsUpdate(doc)),
      docId,
    ]);
    const res = await save(user, docId, { label: 'too many' }).expect(409);
    expect(res.body).toMatchObject({ code: 'too-many-names' });
  });

  it('rejects a name that is too long, and a label of the wrong type', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Validated', 'text');

    await save(user, docId, { label: 'x'.repeat(MAX_LABEL_LENGTH + 1) }).expect(400);
    await save(user, docId, { label: 42 }).expect(400);
  });

  it('hides the document from everyone but its owner, and while it is trashed', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const docId = await docWithState(owner, 'Private', 'text');

    await save(stranger, docId, { label: 'nope' }).expect(404);
    await request(app).delete(`/api/documents/${docId}`).set(owner.auth).expect(204);
    await save(owner, docId, { label: 'nope' }).expect(404);
  });

  it('requires authentication', async () => {
    await request(app)
      .post('/api/documents/11111111-1111-1111-1111-111111111111/versions')
      .send({ label: 'x' })
      .expect(401);
  });
});

describe('PATCH /api/documents/:id/versions/:versionId', () => {
  it('names an existing version, renames it, and clears the name', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Renamed', 'text');
    const created = await save(user, docId).expect(201);
    const versionId = (created.body as VersionRow).id;

    expect((await rename(user, docId, versionId, { label: 'Keep' }).expect(200)).body)
      .toMatchObject({ label: 'Keep' });
    expect((await rename(user, docId, versionId, { label: 'Keep, actually' }).expect(200)).body)
      .toMatchObject({ label: 'Keep, actually' });
    expect((await rename(user, docId, versionId, { label: '' }).expect(200)).body)
      .toMatchObject({ label: null });
    expect((await rename(user, docId, versionId, { label: null }).expect(200)).body)
      .toMatchObject({ label: null });
  });

  it('404s for a version of another document', async () => {
    const user = await signUp();
    const mine = await docWithState(user, 'Mine', 'a');
    const theirs = await docWithState(user, 'Theirs', 'b');
    const created = await save(user, theirs).expect(201);

    await rename(user, mine, (created.body as VersionRow).id, { label: 'nope' }).expect(404);
  });

  it('rejects ids that are not UUIDs instead of failing in PostgreSQL', async () => {
    const user = await signUp();
    const docId = await docWithState(user, 'Ids', 'a');
    await rename(user, docId, 'not-a-uuid', { label: 'x' }).expect(400);
  });

  it('requires authentication', async () => {
    await request(app)
      .patch('/api/documents/11111111-1111-1111-1111-111111111111/versions/22222222-2222-2222-2222-222222222222')
      .send({ label: 'x' })
      .expect(401);
  });
});
