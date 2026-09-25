import { describe, it, expect } from 'vitest';
import {
  fetchDocuments,
  fetchTrashedDocuments,
  createDocument,
  renameDocument,
  removeDocument,
  restoreDocument,
  purgeDocument,
  emptyTrash,
  saveDocContent,
} from './documentApi';
import { DOCS_LIST_KEY, DOC_KEY_PREFIX, TRASH_LIST_KEY } from '../constants/autosave';

// Signed out, every one of these runs against localStorage; `null` is the token
const OFFLINE = null;
const titles = (docs: { title: string }[]) => docs.map((d) => d.title);
const contentOf = (id: string) => localStorage.getItem(`${DOC_KEY_PREFIX}${id}`);

describe('offline document store', () => {
  it('starts with one untitled document', async () => {
    expect(titles(await fetchDocuments(OFFLINE))).toEqual(['Untitled']);
  });

  it('keeps a trashed document out of the list and in the trash', async () => {
    const keep = await createDocument(OFFLINE);
    await renameDocument(keep.id, 'Keep me', OFFLINE);
    const doomed = await createDocument(OFFLINE);
    await renameDocument(doomed.id, 'Trash me', OFFLINE);

    await removeDocument(doomed.id, OFFLINE);

    expect(titles(await fetchDocuments(OFFLINE))).not.toContain('Trash me');
    expect(titles(await fetchTrashedDocuments(OFFLINE))).toEqual(['Trash me']);
  });

  it('keeps the document content while it sits in the trash', async () => {
    const doc = await createDocument(OFFLINE);
    await saveDocContent(doc.id, { title: 'Draft', content: '{"root":"..."}' });

    await removeDocument(doc.id, OFFLINE);
    expect(contentOf(doc.id)).toContain('root');

    await restoreDocument(doc.id, OFFLINE);
    expect(contentOf(doc.id)).toContain('root');
    expect((await fetchDocuments(OFFLINE)).some((d) => d.id === doc.id)).toBe(true);
    expect(await fetchTrashedDocuments(OFFLINE)).toEqual([]);
  });

  it('deletes the content only when a document is purged', async () => {
    const doc = await createDocument(OFFLINE);
    await saveDocContent(doc.id, { title: 'Doomed', content: '{}' });
    await removeDocument(doc.id, OFFLINE);

    await purgeDocument(doc.id, OFFLINE);

    expect(contentOf(doc.id)).toBeNull();
    expect(await fetchTrashedDocuments(OFFLINE)).toEqual([]);
  });

  it('empties the trash and reports how many went', async () => {
    const a = await createDocument(OFFLINE);
    const b = await createDocument(OFFLINE);
    await saveDocContent(a.id, { title: 'a', content: '{}' });
    await removeDocument(a.id, OFFLINE);
    await removeDocument(b.id, OFFLINE);

    expect(await emptyTrash(OFFLINE)).toBe(2);
    expect(await fetchTrashedDocuments(OFFLINE)).toEqual([]);
    expect(contentOf(a.id)).toBeNull();
  });

  it('orders the trash with the newest deletion first', async () => {
    const first = await createDocument(OFFLINE);
    await renameDocument(first.id, 'First', OFFLINE);
    const second = await createDocument(OFFLINE);
    await renameDocument(second.id, 'Second', OFFLINE);

    await removeDocument(first.id, OFFLINE);
    await new Promise((r) => setTimeout(r, 5));
    await removeDocument(second.id, OFFLINE);

    expect(titles(await fetchTrashedDocuments(OFFLINE))).toEqual(['Second', 'First']);
  });

  it('never loses a document when the second write fails', async () => {
    const doc = await createDocument(OFFLINE);
    await renameDocument(doc.id, 'Fragile', OFFLINE);

    // the destination list is written first, so a failure writing the source
    // list leaves the document recoverable rather than gone from both
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key === DOCS_LIST_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };

    await expect(removeDocument(doc.id, OFFLINE)).rejects.toThrow();
    Storage.prototype.setItem = original;

    const stillSomewhere =
      (await fetchTrashedDocuments(OFFLINE)).some((d) => d.id === doc.id) ||
      (await fetchDocuments(OFFLINE)).some((d) => d.id === doc.id);
    expect(stillSomewhere).toBe(true);
    expect(localStorage.getItem(TRASH_LIST_KEY)).toContain(doc.id);
  });
});
