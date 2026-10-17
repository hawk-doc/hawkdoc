import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordLocalVersion,
  listLocalVersions,
  readLocalVersion,
  clearLocalVersions,
  LOCAL_VERSION_INTERVAL_MS,
  MAX_LOCAL_VERSIONS,
  MAX_NAMED_LOCAL_VERSIONS,
  MAX_LOCAL_LABEL_LENGTH,
  saveLocalVersion,
  nameLocalVersion,
  countNamedLocalVersions,
} from './localVersions';
import { VERSIONS_KEY_PREFIX } from '../../constants/autosave';

const DOC = 'doc-1';

function state(text: string): string {
  return JSON.stringify({ root: { children: [{ type: 'paragraph', text }] } });
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

const EMPTY = JSON.stringify({
  root: { type: 'root', children: [{ type: 'paragraph', children: [] }] },
});

describe('local version snapshots', () => {
  it('does not start a history with an empty document', () => {
    // The editor reports its state the moment it mounts; snapshotting that
    // would leave the throttle holding back the first real content
    const start = Date.now();
    expect(recordLocalVersion(DOC, EMPTY, start)).toBe(false);
    expect(recordLocalVersion(DOC, JSON.stringify({ root: { children: [] } }), start)).toBe(false);
    expect(listLocalVersions(DOC)).toEqual([]);

    // The first typed character is what starts it, without waiting
    expect(recordLocalVersion(DOC, state('first words'), start + 500)).toBe(true);
    expect(listLocalVersions(DOC)).toHaveLength(1);
  });

  it('starts a history for a document holding only an image', () => {
    // "Empty" means nothing a reader would notice, not "no text"
    const imageOnly = JSON.stringify({
      root: { type: 'root', children: [{ type: 'image', src: '/uploads/a.png' }] },
    });
    expect(recordLocalVersion(DOC, imageOnly, Date.now())).toBe(true);
  });

  it('keeps an empty state once a history exists, because clearing is an edit', () => {
    const start = Date.now();
    recordLocalVersion(DOC, state('some writing'), start);
    expect(recordLocalVersion(DOC, EMPTY, start + LOCAL_VERSION_INTERVAL_MS)).toBe(true);
    expect(listLocalVersions(DOC)).toHaveLength(2);
  });

  it('records the first snapshot and reads it back', () => {
    const now = Date.now();
    expect(recordLocalVersion(DOC, state('first'), now)).toBe(true);

    const [version] = listLocalVersions(DOC);
    expect(version).toMatchObject({ createdAt: now });
    expect(readLocalVersion(DOC, version!.id)).toBe(state('first'));
  });

  it('waits out the interval between snapshots', () => {
    const start = Date.now();
    recordLocalVersion(DOC, state('one'), start);

    expect(recordLocalVersion(DOC, state('two'), start + 60_000)).toBe(false);
    expect(listLocalVersions(DOC)).toHaveLength(1);

    expect(recordLocalVersion(DOC, state('two'), start + LOCAL_VERSION_INTERVAL_MS)).toBe(true);
    expect(listLocalVersions(DOC)).toHaveLength(2);
  });

  it('skips a snapshot identical to the newest one', () => {
    const start = Date.now();
    recordLocalVersion(DOC, state('same'), start);
    expect(recordLocalVersion(DOC, state('same'), start + LOCAL_VERSION_INTERVAL_MS * 2)).toBe(false);
    expect(listLocalVersions(DOC)).toHaveLength(1);
  });

  it('lists newest first and keeps only the cap', () => {
    const start = Date.now();
    for (let i = 0; i < MAX_LOCAL_VERSIONS + 5; i++) {
      recordLocalVersion(DOC, state(`edit ${i}`), start + i * LOCAL_VERSION_INTERVAL_MS);
    }

    const versions = listLocalVersions(DOC);
    expect(versions).toHaveLength(MAX_LOCAL_VERSIONS);
    expect(versions[0]!.content).toBe(state(`edit ${MAX_LOCAL_VERSIONS + 4}`));
    const times = versions.map((v) => v.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('keeps history separate per document', () => {
    const start = Date.now();
    recordLocalVersion(DOC, state('mine'), start);
    recordLocalVersion('doc-2', state('theirs'), start);

    expect(listLocalVersions(DOC)[0]!.content).toBe(state('mine'));
    expect(listLocalVersions('doc-2')[0]!.content).toBe(state('theirs'));

    clearLocalVersions(DOC);
    expect(listLocalVersions(DOC)).toEqual([]);
    expect(listLocalVersions('doc-2')).toHaveLength(1);
  });

  it('gives up history rather than failing a save when storage is full', () => {
    const start = Date.now();
    for (let i = 0; i < 4; i++) {
      recordLocalVersion(DOC, state(`edit ${i}`), start + i * LOCAL_VERSION_INTERVAL_MS);
    }
    expect(listLocalVersions(DOC)).toHaveLength(4);

    // Stand in for a full quota: accept only writes holding up to two snapshots
    const snapshotsIn = (value: string) => (value.match(/"createdAt"/g) ?? []).length;
    const real = localStorage.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((storageKey: string, value: string) => {
      if (storageKey.startsWith(VERSIONS_KEY_PREFIX) && snapshotsIn(value) > 2) {
        throw new DOMException('exceeded the quota', 'QuotaExceededError');
      }
      real(storageKey, value);
    });

    expect(recordLocalVersion(DOC, state('newest'), start + 10 * LOCAL_VERSION_INTERVAL_MS)).toBe(true);

    const kept = listLocalVersions(DOC);
    expect(kept).toHaveLength(2);
    expect(kept[0]!.content).toBe(state('newest'));
  });

  it('ignores history that is not readable', () => {
    localStorage.setItem(`${VERSIONS_KEY_PREFIX}${DOC}`, 'not json');
    expect(listLocalVersions(DOC)).toEqual([]);

    localStorage.setItem(`${VERSIONS_KEY_PREFIX}${DOC}`, JSON.stringify([{ nope: true }, null]));
    expect(listLocalVersions(DOC)).toEqual([]);
  });
});

describe('named snapshots offline', () => {
  const DOC = 'doc-named';
  const state = (text: string) => JSON.stringify({
    root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
  });

  it('saves a snapshot under a name, ignoring the throttle', () => {
    expect(saveLocalVersion(DOC, state('first'), 'First draft')).toBe('created');
    // The throttle would block this one; an explicit save must not wait
    expect(saveLocalVersion(DOC, state('second'), 'Second draft')).toBe('created');

    expect(listLocalVersions(DOC).map((v) => v.label)).toEqual(['Second draft', 'First draft']);
  });

  it('names the newest snapshot instead of writing an identical one', () => {
    const content = state('unchanged');
    expect(saveLocalVersion(DOC, content)).toBe('created');
    expect(saveLocalVersion(DOC, content, 'Worth keeping')).toBe('named-existing');

    const versions = listLocalVersions(DOC);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.label).toBe('Worth keeping');
  });

  it('trims the oldest unnamed snapshot and keeps the named one', () => {
    expect(saveLocalVersion(DOC, state('keep me'), 'Keep me')).toBe('created');
    const first = listLocalVersions(DOC)[0]!.id;

    for (let i = 0; i < MAX_LOCAL_VERSIONS; i++) {
      expect(saveLocalVersion(DOC, state(`edit ${i}`))).toBe('created');
    }

    const versions = listLocalVersions(DOC);
    expect(versions).toHaveLength(MAX_LOCAL_VERSIONS);
    // The named one survived, though it was the oldest
    expect(versions.map((v) => v.id)).toContain(first);
    expect(versions.filter((v) => v.label)).toHaveLength(1);
  });

  it('names, renames and clears the name on an existing snapshot', () => {
    saveLocalVersion(DOC, state('text'));
    const id = listLocalVersions(DOC)[0]!.id;

    expect(nameLocalVersion(DOC, id, 'Keep')).toMatchObject({ label: 'Keep' });
    expect(nameLocalVersion(DOC, id, 'Keep, actually')).toMatchObject({ label: 'Keep, actually' });
    expect(nameLocalVersion(DOC, id, '  ')).not.toHaveProperty('label');
    expect(listLocalVersions(DOC)[0]!.label).toBeUndefined();
  });

  it('trims and caps a name', () => {
    saveLocalVersion(DOC, state('text'));
    const id = listLocalVersions(DOC)[0]!.id;

    expect(nameLocalVersion(DOC, id, '  padded  ')).toMatchObject({ label: 'padded' });
    expect(nameLocalVersion(DOC, id, 'x'.repeat(MAX_LOCAL_LABEL_LENGTH + 20)))
      .toMatchObject({ label: 'x'.repeat(MAX_LOCAL_LABEL_LENGTH) });
  });

  it('refuses a snapshot that is not there', () => {
    expect(nameLocalVersion(DOC, 'missing', 'nope')).toBe('not-found');
  });

  it('holds names to a cap', () => {
    for (let i = 0; i < MAX_NAMED_LOCAL_VERSIONS; i++) {
      expect(saveLocalVersion(DOC, state(`edit ${i}`), `name ${i}`)).toBe('created');
    }
    expect(countNamedLocalVersions(DOC)).toBe(MAX_NAMED_LOCAL_VERSIONS);

    expect(saveLocalVersion(DOC, state('one more'), 'too many')).toBe('too-many-names');
    const unnamed = listLocalVersions(DOC)[0]!.id;
    expect(nameLocalVersion(DOC, unnamed, 'renamed')).toMatchObject({ label: 'renamed' });
  });

  it('reads a named snapshot back like any other', () => {
    saveLocalVersion(DOC, state('named content'), 'Named');
    const id = listLocalVersions(DOC)[0]!.id;
    expect(readLocalVersion(DOC, id)).toBe(state('named content'));
  });
});
