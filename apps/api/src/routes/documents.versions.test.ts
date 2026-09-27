import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import * as Y from 'yjs';
import { app, signUp, createDoc, closeConnections, type TestUser } from '../test/helpers.js';
import { recordVersion } from '../versions.js';

afterAll(closeConnections);

interface VersionRow {
  id: string;
  createdAt: string;
  sizeBytes: number;
}

/** A document with `edits.length` versions, oldest first */
async function docWithHistory(user: TestUser, title: string, edits: string[]): Promise<string> {
  const { id } = await createDoc(user, title);
  const doc = new Y.Doc();
  for (const edit of edits) {
    const text = doc.getText('t');
    text.insert(text.length, edit);
    await recordVersion(id, Buffer.from(Y.encodeStateAsUpdate(doc)), { force: true });
  }
  return id;
}

/** The text a version rebuilds to, as the client would read it */
async function textAt(user: TestUser, docId: string, versionId: string): Promise<string> {
  const res = await request(app)
    .get(`/api/documents/${docId}/versions/${versionId}`)
    .set(user.auth)
    .expect(200);
  const { yjsState } = res.body as { yjsState: string };
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(yjsState, 'base64')));
  return doc.getText('t').toString();
}

async function getVersions(user: TestUser, docId: string): Promise<VersionRow[]> {
  const res = await request(app).get(`/api/documents/${docId}/versions`).set(user.auth).expect(200);
  return res.body as VersionRow[];
}

describe('GET /api/documents/:id/versions', () => {
  it('lists a document\'s versions newest first', async () => {
    const user = await signUp();
    const docId = await docWithHistory(user, 'Listed', ['one ', 'two ', 'three ']);

    const versions = await getVersions(user, docId);
    expect(versions).toHaveLength(3);
    for (const version of versions) {
      expect(version).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        sizeBytes: expect.any(Number),
      });
      expect(Number.isNaN(Date.parse(version.createdAt))).toBe(false);
    }

    // Newest first is about the order edits were made, which timestamps alone
    // don't prove: rebuild both ends and compare what they contain.
    expect(await textAt(user, docId, versions[0]!.id)).toBe('one two three ');
    expect(await textAt(user, docId, versions[2]!.id)).toBe('one ');
  });

  it('is empty for a document that was never edited', async () => {
    const user = await signUp();
    const { id } = await createDoc(user, 'Fresh');
    expect(await getVersions(user, id)).toEqual([]);
  });

  it('returns the document state as of a version', async () => {
    const user = await signUp();
    const docId = await docWithHistory(user, 'Rebuilt', ['before ', 'after ']);
    const versions = await getVersions(user, docId);
    const first = versions[versions.length - 1]!;

    const res = await request(app)
      .get(`/api/documents/${docId}/versions/${first.id}`)
      .set(user.auth)
      .expect(200);

    const body = res.body as { id: string; yjsState: string };
    expect(body.id).toBe(first.id);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(Buffer.from(body.yjsState, 'base64')));
    expect(doc.getText('t').toString()).toBe('before ');
  });

  it('hides history from everyone but the owner', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const docId = await docWithHistory(owner, 'Private', ['secret ']);
    const [version] = await getVersions(owner, docId);

    await request(app).get(`/api/documents/${docId}/versions`).set(stranger.auth).expect(404);
    await request(app)
      .get(`/api/documents/${docId}/versions/${version!.id}`)
      .set(stranger.auth)
      .expect(404);
  });

  it('hides history while the document is in the trash', async () => {
    const user = await signUp();
    const docId = await docWithHistory(user, 'Trashed', ['content ']);
    const [version] = await getVersions(user, docId);

    await request(app).delete(`/api/documents/${docId}`).set(user.auth).expect(204);

    await request(app).get(`/api/documents/${docId}/versions`).set(user.auth).expect(404);
    await request(app)
      .get(`/api/documents/${docId}/versions/${version!.id}`)
      .set(user.auth)
      .expect(404);

    // Restoring the document brings its history back with it
    await request(app).post(`/api/documents/${docId}/restore`).set(user.auth).expect(200);
    expect(await getVersions(user, docId)).toHaveLength(1);
  });

  it('404s for a version of a different document', async () => {
    const user = await signUp();
    const mine = await docWithHistory(user, 'Mine', ['a ']);
    const other = await docWithHistory(user, 'Other', ['b ']);
    const [version] = await getVersions(user, other);

    await request(app)
      .get(`/api/documents/${mine}/versions/${version!.id}`)
      .set(user.auth)
      .expect(404);
  });

  it('rejects ids that are not UUIDs instead of failing in PostgreSQL', async () => {
    const user = await signUp();
    const docId = await docWithHistory(user, 'Validated', ['a ']);

    await request(app).get('/api/documents/not-a-uuid/versions').set(user.auth).expect(400);
    await request(app)
      .get(`/api/documents/${docId}/versions/not-a-uuid`)
      .set(user.auth)
      .expect(400);
  });

  it('requires authentication', async () => {
    const user = await signUp();
    const docId = await docWithHistory(user, 'Guarded', ['a ']);
    await request(app).get(`/api/documents/${docId}/versions`).expect(401);
  });
});
