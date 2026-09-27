import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordLocalVersion,
  listLocalVersions,
  readLocalVersion,
  clearLocalVersions,
  LOCAL_VERSION_INTERVAL_MS,
  MAX_LOCAL_VERSIONS,
} from './localVersions';
import { VERSIONS_KEY_PREFIX } from '../../constants/autosave';

const DOC = 'doc-1';

function state(text: string): string {
  return JSON.stringify({ root: { children: [{ type: 'paragraph', text }] } });
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('local version snapshots', () => {
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
