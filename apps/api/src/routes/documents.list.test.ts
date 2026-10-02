import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import query from '../db.js';
import { app, signUp, createDoc, closeConnections, type TestUser } from '../test/helpers.js';

afterAll(closeConnections);

interface Page {
  titles: string[];
  next: string | null;
  total: string | undefined;
}

/** The next page's path, as the client reads it out of the Link header */
function nextFrom(link: string | undefined): string | null {
  const match = /<([^>]+)>;\s*rel="next"/.exec(link ?? '');
  return match ? match[1]! : null;
}

async function list(user: TestUser, path = '/api/documents'): Promise<Page> {
  const res = await request(app).get(path).set(user.auth).expect(200);
  return {
    titles: (res.body as { title: string }[]).map((doc) => doc.title),
    next: nextFrom(res.headers['link']),
    total: res.headers['x-total-count'],
  };
}

/**
 * Seeds documents with distinct timestamps, so the order they come back in is
 * the order they were last touched rather than whatever ties resolve to.
 * Inserted directly: sixty HTTP round trips would only slow the test down.
 */
async function seed(user: TestUser, titles: string[], column = 'updated_at'): Promise<void> {
  for (const [index, title] of titles.entries()) {
    await query(
      `INSERT INTO documents (owner_id, title, updated_at, deleted_at)
       VALUES ($1, $2, NOW() - ($3 || ' minutes')::interval,
               ${column === 'deleted_at' ? `NOW() - ($3 || ' minutes')::interval` : 'NULL'})`,
      [user.id, title, index],
    );
  }
}

/** Walks every page, following the Link header as a client would */
async function walk(user: TestUser, path: string): Promise<string[]> {
  const seen: string[] = [];
  let next: string | null = path;
  while (next) {
    const page: Page = await list(user, next);
    seen.push(...page.titles);
    next = page.next;
    if (seen.length > 500) throw new Error('paging did not terminate');
  }
  return seen;
}

describe('listing documents a page at a time', () => {
  it('returns one page and says where the next one starts', async () => {
    const user = await signUp();
    await seed(user, Array.from({ length: 60 }, (_, i) => `Doc ${i}`));

    const first = await list(user);

    expect(first.titles).toHaveLength(50);
    expect(first.titles[0]).toBe('Doc 0');
    expect(first.next).toMatch(/cursor=/);
    // The count is of everything matching, not of the page
    expect(first.total).toBe('60');
  });

  it('pages through every document exactly once', async () => {
    const user = await signUp();
    const titles = Array.from({ length: 25 }, (_, i) => `Doc ${i}`);
    await seed(user, titles);

    const seen = await walk(user, '/api/documents?limit=10');

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen).toEqual(titles);
  });

  it('counts only on the first page, where the number is still worth having', async () => {
    const user = await signUp();
    await seed(user, Array.from({ length: 12 }, (_, i) => `Doc ${i}`));

    const first = await list(user, '/api/documents?limit=5');
    expect(first.total).toBe('12');

    const second = await list(user, first.next!);
    expect(second.total).toBeUndefined();
  });

  it('does not repeat a document that was edited while paging', async () => {
    // The reason for a cursor rather than an offset: editing a document moves
    // it to the top of the list, and with OFFSET every later page shifts by one
    const user = await signUp();
    await seed(user, Array.from({ length: 20 }, (_, i) => `Doc ${i}`));

    const first = await list(user, '/api/documents?limit=10');
    await request(app)
      .patch(`/api/documents/${(await request(app).get('/api/documents?limit=1').set(user.auth)).body[0].id}`)
      .set(user.auth)
      .send({ title: 'Edited while paging' })
      .expect(200);

    const second = await list(user, first.next!);

    expect(second.titles).not.toContain('Edited while paging');
    expect(new Set([...first.titles, ...second.titles]).size).toBe(20);
  });

  it('pages documents saved in the same instant without losing any', async () => {
    // The case the id in the cursor exists for: a bulk import, or two saves
    // landing in the same instant, leave the sort column unable to separate
    // them, and the page boundary falls inside the tie.
    const user = await signUp();
    await query(
      `INSERT INTO documents (owner_id, title, updated_at)
       SELECT $1, 'Tied ' || i, NOW() FROM generate_series(1, 12) AS i`,
      [user.id],
    );

    const seen = await walk(user, '/api/documents?limit=5');

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it('stops offering a next page at the end', async () => {
    const user = await signUp();
    await seed(user, ['Only one']);

    const page = await list(user);
    expect(page.titles).toEqual(['Only one']);
    expect(page.next).toBeNull();
  });

  it('rejects a page size it will not serve, and a cursor it did not issue', async () => {
    const user = await signUp();

    await request(app).get('/api/documents?limit=0').set(user.auth).expect(400);
    await request(app).get('/api/documents?limit=101').set(user.auth).expect(400);
    await request(app).get('/api/documents?limit=abc').set(user.auth).expect(400);
    await request(app).get('/api/documents?cursor=not-a-cursor').set(user.auth).expect(400);
    await request(app)
      .get(`/api/documents?cursor=${Buffer.from('2026-01-01T00:00:00Z|not-a-uuid').toString('base64url')}`)
      .set(user.auth)
      .expect(400);
  });
});

describe('searching documents', () => {
  it('matches part of a title, whatever the case', async () => {
    const user = await signUp();
    await seed(user, ['Quarterly Report', 'quarterly notes', 'Shopping list']);

    expect((await list(user, '/api/documents?q=quarterly')).titles.sort())
      .toEqual(['Quarterly Report', 'quarterly notes']);
    expect((await list(user, '/api/documents?q=SHOPPING')).titles).toEqual(['Shopping list']);
    expect((await list(user, '/api/documents?q=nothing here')).titles).toEqual([]);
  });

  it('counts and pages the matches, not the whole list', async () => {
    const user = await signUp();
    await seed(user, [
      ...Array.from({ length: 8 }, (_, i) => `Report ${i}`),
      ...Array.from({ length: 5 }, (_, i) => `Note ${i}`),
    ]);

    const first = await list(user, '/api/documents?q=report&limit=5');
    expect(first.total).toBe('8');
    expect(first.titles).toHaveLength(5);

    const seen = await walk(user, '/api/documents?q=report&limit=5');
    expect(seen).toHaveLength(8);
    expect(seen.every((title) => title.startsWith('Report'))).toBe(true);
  });

  it('treats wildcards in the search as the characters they look like', async () => {
    const user = await signUp();
    await seed(user, ['100% complete', 'Nothing like it', 'snake_case', 'snakeXcase']);

    expect((await list(user, '/api/documents?q=100%25')).titles).toEqual(['100% complete']);
    expect((await list(user, '/api/documents?q=snake_case')).titles).toEqual(['snake_case']);
  });

  it('never reaches documents belonging to someone else', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    await createDoc(owner, 'Private plans');

    expect((await list(stranger, '/api/documents?q=private')).titles).toEqual([]);
    expect((await list(stranger)).total).toBe('0');
  });
});

describe('listing the trash a page at a time', () => {
  it('pages and searches the trash by when things were thrown away', async () => {
    const user = await signUp();
    await seed(user, ['Trashed report', 'Trashed note', 'Trashed plan'], 'deleted_at');
    await seed(user, ['Still here']);

    const first = await list(user, '/api/documents?trash=true&limit=2');
    expect(first.titles).toEqual(['Trashed report', 'Trashed note']);
    expect(first.total).toBe('3');
    expect(first.next).toMatch(/trash=true/);

    const rest = await list(user, first.next!);
    expect(rest.titles).toEqual(['Trashed plan']);
    expect(rest.next).toBeNull();

    expect((await list(user, '/api/documents?trash=true&q=report')).titles).toEqual(['Trashed report']);
    expect((await list(user)).titles).toEqual(['Still here']);
  });
});
