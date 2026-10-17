import { describe, it, expect, afterAll } from 'vitest';
import * as Y from 'yjs';
import query from './db.js';
import { signUp, createDoc, closeConnections, type TestUser } from './test/helpers.js';
import {
  recordVersion,
  nameVersion,
  listVersions,
  countNamedVersions,
  reconstructVersion,
  MAX_VERSIONS_PER_DOC,
  MAX_NAMED_VERSIONS,
  MAX_LABEL_LENGTH,
} from './versions.js';

afterAll(closeConnections);

/** One edit per entry, so version i holds edits 0..i */
function edit(index: number): string {
  return `e${index} `;
}

/**
 * Records `count` versions of a document, each adding one more edit, and
 * returns their ids oldest first. `onEach` runs after each one, so a version
 * can be named while it is still young enough to exist.
 */
async function history(
  user: TestUser,
  title: string,
  count: number,
  onEach?: (index: number, versionId: string, docId: string) => Promise<void>,
): Promise<{ docId: string; ids: string[] }> {
  const { id: docId } = await createDoc(user, title);
  const doc = new Y.Doc();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = doc.getText('t');
    text.insert(text.length, edit(i));
    const outcome = await recordVersion(docId, Buffer.from(Y.encodeStateAsUpdate(doc)), { force: true });
    expect(outcome).toBe('created');
    const newest = await query<{ id: string }>(
      'SELECT id FROM document_versions WHERE document_id = $1 ORDER BY seq DESC LIMIT 1',
      [docId],
    );
    const versionId = newest.rows[0]!.id;
    ids.push(versionId);
    await onEach?.(i, versionId, docId);
  }
  return { docId, ids };
}

/**
 * Inserts `count` versions straight into the table, the way recordVersion
 * computes them, without pruning between each.
 *
 * Pruning normally runs after every insert, so it only ever drops one version
 * at a time. A history seeded past the cap in one go makes a single prune drop
 * several — which is the case where merging into the wrong successor shows up.
 */
async function seedHistory(
  user: TestUser,
  title: string,
  count: number,
  names: Record<number, string> = {},
): Promise<{ docId: string; ids: string[] }> {
  const { id: docId } = await createDoc(user, title);
  const doc = new Y.Doc();
  const ids: string[] = [];
  let previousVector: Buffer | null = null;

  for (let i = 0; i < count; i++) {
    const text = doc.getText('t');
    text.insert(text.length, edit(i));
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    const vector = Buffer.from(Y.encodeStateVectorFromUpdate(state));
    const delta = previousVector ? Buffer.from(Y.diffUpdate(state, previousVector)) : state;
    previousVector = vector;

    const inserted = await query<{ id: string }>(
      `INSERT INTO document_versions (document_id, update_data, state_vector, label)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [docId, delta, vector, names[i] ?? null],
    );
    ids.push(inserted.rows[0]!.id);
  }
  return { docId, ids };
}

/** The text a version rebuilds to */
async function textAt(docId: string, versionId: string): Promise<string> {
  const state = await reconstructVersion(docId, versionId);
  if (!state) throw new Error(`version ${versionId} is gone`);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  return doc.getText('t').toString();
}

/** What the text should be at version `index` */
const expectedAt = (index: number) =>
  Array.from({ length: index + 1 }, (_, i) => edit(i)).join('');

const liveIds = async (docId: string) =>
  (await listVersions(docId)).map((version) => version.id);

describe('named versions', () => {
  it('names a version and reports the name in the list', async () => {
    const user = await signUp();
    const { docId, ids } = await history(user, 'Named', 2);

    const named = await nameVersion(docId, ids[1]!, 'Before the rewrite');
    expect(named).toMatchObject({ id: ids[1], label: 'Before the rewrite' });

    const listed = await listVersions(docId);
    expect(listed.map((v) => v.label)).toEqual(['Before the rewrite', null]);
  });

  it('trims and caps a name, and treats blank as no name', async () => {
    const user = await signUp();
    const { docId, ids } = await history(user, 'Trimmed', 1);

    expect(await nameVersion(docId, ids[0]!, '  padded  ')).toMatchObject({ label: 'padded' });
    expect(await nameVersion(docId, ids[0]!, 'x'.repeat(MAX_LABEL_LENGTH + 50)))
      .toMatchObject({ label: 'x'.repeat(MAX_LABEL_LENGTH) });
    expect(await nameVersion(docId, ids[0]!, '   ')).toMatchObject({ label: null });
  });

  it('refuses a version that belongs to another document', async () => {
    const user = await signUp();
    const mine = await history(user, 'Mine', 1);
    const theirs = await history(user, 'Theirs', 1);

    expect(await nameVersion(mine.docId, theirs.ids[0]!, 'nope')).toBe('not-found');
  });

  it('holds names to a cap, so a named history cannot grow forever', async () => {
    const user = await signUp();
    const { docId, ids } = await history(user, 'Capped', MAX_NAMED_VERSIONS + 2);

    for (let i = 0; i < MAX_NAMED_VERSIONS; i++) {
      expect(await nameVersion(docId, ids[i]!, `name ${i}`)).toMatchObject({ label: `name ${i}` });
    }
    expect(await countNamedVersions(docId)).toBe(MAX_NAMED_VERSIONS);

    expect(await nameVersion(docId, ids[MAX_NAMED_VERSIONS]!, 'one too many')).toBe('too-many-names');
    // Renaming one that already has a name doesn't count against the cap
    expect(await nameVersion(docId, ids[0]!, 'renamed')).toMatchObject({ label: 'renamed' });
    // Nor does saving a new version without a name
    expect(await recordVersion(docId, Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())), { force: true }))
      .not.toBe('too-many-names');
  });

  it('refuses to record a new named version once the cap is reached', async () => {
    const user = await signUp();
    const { docId, ids } = await history(user, 'Cap on record', MAX_NAMED_VERSIONS);
    for (let i = 0; i < MAX_NAMED_VERSIONS; i++) await nameVersion(docId, ids[i]!, `n${i}`);

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'more');
    expect(await recordVersion(docId, Buffer.from(Y.encodeStateAsUpdate(doc)), {
      force: true,
      label: 'over the cap',
    })).toBe('too-many-names');
  });
});

describe('pruning around named versions', () => {
  // Slow by nature: pruning only happens past the cap, so the history has to
  // be built past it.
  it('keeps named versions and rebuilds every survivor correctly', async () => {
    const user = await signUp();
    const NAMED_EARLY = 0;
    const NAMED_MIDDLE = 5;
    const total = MAX_VERSIONS_PER_DOC + 5;

    const { docId, ids } = await history(user, 'Pruned', total, async (index, versionId, id) => {
      if (index === NAMED_EARLY) await nameVersion(id, versionId, 'the beginning');
      if (index === NAMED_MIDDLE) await nameVersion(id, versionId, 'before the big edit');
    });

    const surviving = await liveIds(docId);
    expect(surviving).toHaveLength(MAX_VERSIONS_PER_DOC);

    // Both names survived, though five versions had to go
    expect(surviving).toContain(ids[NAMED_EARLY]);
    expect(surviving).toContain(ids[NAMED_MIDDLE]);

    // And each one still rebuilds exactly the document it held. This is what
    // merging a dropped delta into its *immediate* successor protects: folding
    // them all into the oldest survivor would carry later edits backwards into
    // the named version.
    expect(await textAt(docId, ids[NAMED_EARLY]!)).toBe(expectedAt(NAMED_EARLY));
    expect(await textAt(docId, ids[NAMED_MIDDLE]!)).toBe(expectedAt(NAMED_MIDDLE));
    expect(await textAt(docId, ids[total - 1]!)).toBe(expectedAt(total - 1));
  }, 60_000);

  it('merges each dropped version into the one right after it', async () => {
    const user = await signUp();
    const NAMED_EARLY = 0;
    const NAMED_MIDDLE = 5;
    const seeded = MAX_VERSIONS_PER_DOC + 4;

    // Seeded past the cap in one go, so the prune below has five versions to
    // drop and they are not all next to each other: 1-4 sit before the named
    // version 5, and 6 sits after it.
    const { docId, ids } = await seedHistory(user, 'Two runs', seeded, {
      [NAMED_EARLY]: 'the beginning',
      [NAMED_MIDDLE]: 'before the big edit',
    });

    const doc = new Y.Doc();
    for (let i = 0; i < seeded + 1; i++) doc.getText('t').insert(doc.getText('t').length, edit(i));
    expect(await recordVersion(docId, Buffer.from(Y.encodeStateAsUpdate(doc)), { force: true }))
      .toBe('created');

    const surviving = await liveIds(docId);
    expect(surviving).toHaveLength(MAX_VERSIONS_PER_DOC);
    expect(surviving).toContain(ids[NAMED_EARLY]);
    expect(surviving).toContain(ids[NAMED_MIDDLE]);
    for (const dropped of [1, 2, 3, 4, 6]) expect(surviving).not.toContain(ids[dropped]);

    // The named version must still rebuild the document it held — not one
    // carrying edit 6, which is what folding every dropped delta into the
    // first survivor would do.
    expect(await textAt(docId, ids[NAMED_MIDDLE]!)).toBe(expectedAt(NAMED_MIDDLE));
    expect(await textAt(docId, ids[NAMED_EARLY]!)).toBe(expectedAt(NAMED_EARLY));
    // And the version that received edit 6 rebuilds with it
    expect(await textAt(docId, ids[7]!)).toBe(expectedAt(7));
  }, 60_000);

  it('makes a version prunable again once its name is cleared', async () => {
    const user = await signUp();
    const total = MAX_VERSIONS_PER_DOC + 1;
    const { docId, ids } = await history(user, 'Unnamed again', total, async (index, versionId, id) => {
      if (index === 0) await nameVersion(id, versionId, 'keep me');
    });

    // The name kept the oldest version while the history grew past the cap;
    // version 1 went instead.
    expect(await liveIds(docId)).toContain(ids[0]);
    expect(await liveIds(docId)).not.toContain(ids[1]);

    await nameVersion(docId, ids[0]!, null);

    // Now unnamed, it is the oldest candidate the next prune reaches for
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'one more edit');
    await recordVersion(docId, Buffer.from(Y.encodeStateAsUpdate(doc)), { force: true });

    expect(await liveIds(docId)).not.toContain(ids[0]);
    expect(await liveIds(docId)).toHaveLength(MAX_VERSIONS_PER_DOC);
  }, 60_000);
});
