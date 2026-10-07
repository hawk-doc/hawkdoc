import { describe, it, expect, afterAll } from 'vitest';
import * as Y from 'yjs';
import query from './db.js';
import {
  recordVersion,
  listVersions,
  reconstructVersion,
  MAX_VERSIONS_PER_DOC,
} from './versions.js';
import { signUp, createDoc, closeConnections, type TestUser } from './test/helpers.js';

afterAll(closeConnections);

/**
 * The versions module never looks inside a document, so these tests use a
 * plain Yjs text rather than Lexical's tree: what matters is that the state
 * recorded at a point in time comes back unchanged.
 */
class Draft {
  readonly #doc = new Y.Doc();

  type(text: string): void {
    const shared = this.#doc.getText('t');
    shared.insert(shared.length, text);
  }

  get text(): string {
    return this.#doc.getText('t').toString();
  }

  get state(): Buffer {
    return Buffer.from(Y.encodeStateAsUpdate(this.#doc));
  }
}

function textOf(state: Buffer): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getText('t').toString();
}

/** Pretend the newest version was recorded long enough ago to allow another */
async function ageNewestVersion(docId: string): Promise<void> {
  await query(
    `UPDATE document_versions SET created_at = NOW() - INTERVAL '1 hour'
     WHERE id = (SELECT id FROM document_versions WHERE document_id = $1 ORDER BY seq DESC LIMIT 1)`,
    [docId],
  );
}

async function docFor(user: TestUser, title: string): Promise<string> {
  return (await createDoc(user, title)).id;
}

describe('document versions', () => {
  it('rebuilds the document as it was at each version', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'History');
    const draft = new Draft();

    const expected: string[] = [];
    for (const line of ['first ', 'second ', 'third ']) {
      draft.type(line);
      expect(await recordVersion(docId, draft.state, { force: true })).toBe('created');
      expected.push(draft.text);
    }

    const versions = await listVersions(docId);
    expect(versions).toHaveLength(3);

    // listVersions is newest first
    const oldestFirst = [...versions].reverse();
    for (const [index, version] of oldestFirst.entries()) {
      const state = await reconstructVersion(docId, version.id);
      expect(state).not.toBeNull();
      expect(textOf(state!)).toBe(expected[index]);
    }
  });

  it('stores changes rather than snapshots', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'Deltas');
    const draft = new Draft();

    draft.type('x'.repeat(2_000));
    await recordVersion(docId, draft.state, { force: true });
    draft.type('!');
    await recordVersion(docId, draft.state, { force: true });

    const [newest, oldest] = await listVersions(docId);
    // The second version holds one more character, not the whole document
    expect(newest!.sizeBytes).toBeLessThan(100);
    expect(oldest!.sizeBytes).toBeGreaterThan(2_000);
  });

  it('records nothing when the document has not changed', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'Idle');
    const draft = new Draft();
    draft.type('done');

    expect(await recordVersion(docId, draft.state, { force: true })).toBe('created');
    expect(await recordVersion(docId, draft.state, { force: true })).toBe('unchanged');
    expect(await listVersions(docId)).toHaveLength(1);
  });

  it('throttles versions unless forced', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'Throttled');
    const draft = new Draft();

    draft.type('one ');
    expect(await recordVersion(docId, draft.state)).toBe('created');

    draft.type('two ');
    expect(await recordVersion(docId, draft.state)).toBe('too-soon');
    expect(await recordVersion(docId, draft.state, { force: true })).toBe('created');

    draft.type('three ');
    await ageNewestVersion(docId);
    expect(await recordVersion(docId, draft.state)).toBe('created');

    // Nothing was lost by the throttled call: the newest version has it all
    const [newest] = await listVersions(docId);
    const state = await reconstructVersion(docId, newest!.id);
    expect(textOf(state!)).toBe('one two three ');
  });

  it('keeps the cap without breaking the older versions it drops', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'Capped');
    const draft = new Draft();

    const overflow = 3;
    const texts: string[] = [];
    for (let i = 1; i <= MAX_VERSIONS_PER_DOC + overflow; i++) {
      draft.type(`e${i} `);
      await recordVersion(docId, draft.state, { force: true });
      texts.push(draft.text);
    }

    const versions = await listVersions(docId);
    expect(versions).toHaveLength(MAX_VERSIONS_PER_DOC);

    // The dropped deltas were folded into the oldest surviving version, so it
    // still rebuilds every edit made before it — not just its own.
    const oldest = versions[versions.length - 1]!;
    const rebuilt = await reconstructVersion(docId, oldest.id);
    expect(textOf(rebuilt!)).toBe(texts[overflow]!);

    const newest = await reconstructVersion(docId, versions[0]!.id);
    expect(textOf(newest!)).toBe(texts[texts.length - 1]!);
  });

  it('holds the cap exactly when versions are recorded concurrently', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'Racing');
    const draft = new Draft();

    for (let i = 1; i <= MAX_VERSIONS_PER_DOC; i++) {
      draft.type(`e${i} `);
      await recordVersion(docId, draft.state, { force: true });
    }

    const racers = 4;
    await Promise.all(
      Array.from({ length: racers }, (_, i) => {
        const other = new Draft();
        other.type(`racer${i} `);
        return recordVersion(docId, other.state, { force: true });
      }),
    );

    expect(await listVersions(docId)).toHaveLength(MAX_VERSIONS_PER_DOC);
  });

  it('does not record a version for a document that no longer exists', async () => {
    const user = await signUp();
    const docId = await docFor(user, 'Gone');
    const draft = new Draft();
    draft.type('bye');

    await query('DELETE FROM documents WHERE id = $1', [docId]);

    expect(await recordVersion(docId, draft.state, { force: true })).toBe('no-document');
    expect(await listVersions(docId)).toEqual([]);
  });

  it('returns null for a version id that belongs to another document', async () => {
    const user = await signUp();
    const mine = await docFor(user, 'Mine');
    const other = await docFor(user, 'Other');
    const draft = new Draft();
    draft.type('content');
    await recordVersion(other, draft.state, { force: true });

    const [version] = await listVersions(other);
    expect(await reconstructVersion(mine, version!.id)).toBeNull();
  });
});
