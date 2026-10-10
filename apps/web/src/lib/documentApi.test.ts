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
  setStarred,
} from './documentApi';
import { DOCS_LIST_KEY, DOC_KEY_PREFIX, TRASH_LIST_KEY } from '../constants/autosave';

// Signed out, every one of these runs against localStorage; `null` is the token
const OFFLINE = null;
const titles = (page: { docs: { title: string }[] }) => page.docs.map((d) => d.title);
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
    expect((await fetchDocuments(OFFLINE)).docs.some((d) => d.id === doc.id)).toBe(true);
    expect((await fetchTrashedDocuments(OFFLINE)).docs).toEqual([]);
  });

  it('deletes the content only when a document is purged', async () => {
    const doc = await createDocument(OFFLINE);
    await saveDocContent(doc.id, { title: 'Doomed', content: '{}' });
    await removeDocument(doc.id, OFFLINE);

    await purgeDocument(doc.id, OFFLINE);

    expect(contentOf(doc.id)).toBeNull();
    expect((await fetchTrashedDocuments(OFFLINE)).docs).toEqual([]);
  });

  it('empties the trash and reports how many went', async () => {
    const a = await createDocument(OFFLINE);
    const b = await createDocument(OFFLINE);
    await saveDocContent(a.id, { title: 'a', content: '{}' });
    await removeDocument(a.id, OFFLINE);
    await removeDocument(b.id, OFFLINE);

    expect(await emptyTrash(OFFLINE)).toBe(2);
    expect((await fetchTrashedDocuments(OFFLINE)).docs).toEqual([]);
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
      (await fetchTrashedDocuments(OFFLINE)).docs.some((d) => d.id === doc.id) ||
      (await fetchDocuments(OFFLINE)).docs.some((d) => d.id === doc.id);
    expect(stillSomewhere).toBe(true);
    expect(localStorage.getItem(TRASH_LIST_KEY)).toContain(doc.id);
  });
});

describe('starring offline', () => {
  it('narrows the list to starred documents and back', async () => {
    const plain = await createDocument(OFFLINE);
    await renameDocument(plain.id, 'Plain', OFFLINE);
    const favourite = await createDocument(OFFLINE);
    await renameDocument(favourite.id, 'Favourite', OFFLINE);

    expect(await setStarred(favourite.id, true, OFFLINE)).toMatchObject({ starred: true });
    expect(titles(await fetchDocuments(OFFLINE, { starred: true }))).toEqual(['Favourite']);
    // The starred document is still in the full list
    expect(titles(await fetchDocuments(OFFLINE))).toContain('Favourite');

    await setStarred(favourite.id, false, OFFLINE);
    expect(titles(await fetchDocuments(OFFLINE, { starred: true }))).toEqual([]);
  });

  it('leaves updatedAt alone, so starring does not reorder the list', async () => {
    const first = await createDocument(OFFLINE);
    await renameDocument(first.id, 'Older', OFFLINE);
    const second = await createDocument(OFFLINE);
    await renameDocument(second.id, 'Newer', OFFLINE);

    const before = (await fetchDocuments(OFFLINE)).docs.find((d) => d.id === first.id)!.updatedAt;
    await setStarred(first.id, true, OFFLINE);
    const after = (await fetchDocuments(OFFLINE)).docs.find((d) => d.id === first.id)!;

    expect(after.updatedAt).toBe(before);
  });

  it('searches within the starred documents', async () => {
    for (const title of ['Budget notes', 'Budget plan', 'Holiday']) {
      const doc = await createDocument(OFFLINE);
      await renameDocument(doc.id, title, OFFLINE);
      if (title.startsWith('Budget')) await setStarred(doc.id, true, OFFLINE);
    }

    const page = await fetchDocuments(OFFLINE, { starred: true, q: 'plan' });
    expect(titles(page)).toEqual(['Budget plan']);
    expect(page.total).toBe(1);
  });

  it('keeps the star through the trash and back', async () => {
    const doc = await createDocument(OFFLINE);
    await renameDocument(doc.id, 'Starred and trashed', OFFLINE);
    await setStarred(doc.id, true, OFFLINE);

    await removeDocument(doc.id, OFFLINE);
    expect(titles(await fetchDocuments(OFFLINE, { starred: true }))).toEqual([]);

    await restoreDocument(doc.id, OFFLINE);
    expect(titles(await fetchDocuments(OFFLINE, { starred: true }))).toEqual(['Starred and trashed']);
  });

  it('refuses to star a document that isn\'t there', async () => {
    await expect(setStarred('missing-id', true, OFFLINE)).rejects.toThrow(/not found/i);
  });
});
