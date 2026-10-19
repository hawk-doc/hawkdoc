import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type SerializedElementNode,
  type SerializedTextNode,
} from 'lexical';
import {
  fetchVersions,
  fetchVersionContent,
  saveRecoveryPoint,
  VersionWriteError,
} from './versionApi';
import { UnauthorizedError } from './documentApi';
import {
  recordLocalVersion,
  listLocalVersions,
  saveLocalVersion,
  LOCAL_VERSION_INTERVAL_MS,
  MAX_NAMED_LOCAL_VERSIONS,
} from './versions/localVersions';
import { yjsUpdateFor } from '../test/collab';

const TOKEN = 'signed-in-token';
const OFFLINE = null;
const DOC = '11111111-1111-1111-1111-111111111111';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function firstParagraphText(state: { root: unknown }): string[] {
  const children = (state.root as SerializedElementNode).children;
  const paragraph = children[0] as SerializedElementNode;
  return paragraph.children.map((child) => (child as unknown as SerializedTextNode).text);
}

beforeEach(() => { localStorage.clear(); });

describe('version history over the API', () => {
  it('carries a version\'s name through', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        { id: 'v2', createdAt: '2026-09-27T10:30:00.000Z', sizeBytes: 40, label: 'Before the cut' },
        { id: 'v1', createdAt: '2026-09-27T10:00:00.000Z', sizeBytes: 900, label: null },
      ]),
    );

    expect((await fetchVersions(DOC, TOKEN)).map((v) => v.label))
      .toEqual(['Before the cut', null]);
  });

  it('lists versions with their timestamps', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        { id: 'v2', createdAt: '2026-09-27T10:30:00.000Z', sizeBytes: 40 },
        { id: 'v1', createdAt: '2026-09-27T10:00:00.000Z', sizeBytes: 900 },
      ]),
    );

    const versions = await fetchVersions(DOC, TOKEN);

    expect(fetchMock.mock.calls[0]![0]).toBe(`http://api.test/api/documents/${DOC}/versions`);
    expect(versions).toEqual([
      { id: 'v2', createdAt: Date.parse('2026-09-27T10:30:00.000Z'), label: null },
      { id: 'v1', createdAt: Date.parse('2026-09-27T10:00:00.000Z'), label: null },
    ]);
  });

  it('reads a version the server returns as Yjs state', async () => {
    // Exactly what the API stores: the Yjs state of a collaborative document
    const update = yjsUpdateFor(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('as it was'));
      $getRoot().append(paragraph);
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ id: 'v1', yjsState: bytesToBase64(update) }),
    );

    const state = await fetchVersionContent(DOC, 'v1', TOKEN);
    expect(firstParagraphText(state)).toEqual(['as it was']);
  });

  it('ends the session when the token is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'nope' }, 401));

    await expect(fetchVersions(DOC, TOKEN)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(fetchVersionContent(DOC, 'v1', TOKEN)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('reports a failure rather than showing an empty history', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(fetchVersions(DOC, TOKEN)).rejects.toThrow(/load version history/);
  });
});

describe('version history offline', () => {
  it('lists and reads the local snapshots', async () => {
    const start = Date.now();
    recordLocalVersion(
      DOC,
      JSON.stringify({ root: { children: [{ children: [{ text: 'earlier' }] }] } }),
      start,
    );
    recordLocalVersion(
      DOC,
      JSON.stringify({ root: { children: [{ children: [{ text: 'later' }] }] } }),
      start + LOCAL_VERSION_INTERVAL_MS,
    );

    const versions = await fetchVersions(DOC, OFFLINE);
    expect(versions.map((version) => version.createdAt)).toEqual([
      start + LOCAL_VERSION_INTERVAL_MS,
      start,
    ]);

    const state = await fetchVersionContent(DOC, versions[0]!.id, OFFLINE);
    expect(firstParagraphText(state)).toEqual(['later']);
  });

  it('never reaches the network', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    recordLocalVersion(
      DOC,
      JSON.stringify({ root: { children: [{ children: [{ text: 'offline work' }] }] } }),
      Date.now(),
    );

    const versions = await fetchVersions(DOC, OFFLINE);
    await fetchVersionContent(DOC, versions[0]!.id, OFFLINE);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when a snapshot is gone', async () => {
    await expect(fetchVersionContent(DOC, 'missing', OFFLINE)).rejects.toThrow(
      /no longer available/,
    );
  });
});

describe('keeping a recovery point', () => {
  const editorState = (text: string) => JSON.stringify({
    root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
  });

  it('saves an unnamed version signed in', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 201));

    await saveRecoveryPoint(DOC, TOKEN, editorState('about to be replaced'));

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/documents/${DOC}/versions`);
    expect(init.method).toBe('POST');
    // Unnamed on purpose: a name would be unprunable and would spend the
    // reader's cap on a name they never chose
    expect(JSON.parse(String(init.body))).toEqual({ label: null });
  });

  it('treats an empty document as nothing to protect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'There is nothing to save yet', code: 'nothing-to-save' }, 409),
    );

    // Resolving is what lets the action it precedes go ahead
    await expect(saveRecoveryPoint(DOC, TOKEN, editorState(''))).resolves.toBeUndefined();
  });

  it('refuses when the version could not be written', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500));

    await expect(saveRecoveryPoint(DOC, TOKEN, editorState('precious'))).rejects.toThrow();
  });

  it('passes a session failure through, so a stale tab signs out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401));

    await expect(saveRecoveryPoint(DOC, TOKEN, editorState('precious')))
      .rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('snapshots to localStorage when signed out', async () => {
    await saveRecoveryPoint(DOC, OFFLINE, editorState('about to be replaced'));

    expect(listLocalVersions(DOC).map((v) => v.content)).toEqual([
      editorState('about to be replaced'),
    ]);
    expect(listLocalVersions(DOC)[0]!.label).toBeUndefined();
  });

  it('is satisfied offline when a snapshot already holds this state', async () => {
    const content = editorState('unchanged');
    saveLocalVersion(DOC, content);

    await expect(saveRecoveryPoint(DOC, OFFLINE, content)).resolves.toBeUndefined();
    // No duplicate: the state is already recoverable
    expect(listLocalVersions(DOC)).toHaveLength(1);
  });

  it('has nothing to protect offline when there is no document to read', async () => {
    // Unreachable in the editor, which checks it has one before either action
    await expect(saveRecoveryPoint(DOC, OFFLINE)).resolves.toBeUndefined();
    expect(listLocalVersions(DOC)).toEqual([]);
  });

  it('is not stopped by a full set of names offline', async () => {
    for (let i = 0; i < MAX_NAMED_LOCAL_VERSIONS; i++) {
      saveLocalVersion(DOC, editorState(`named ${i}`), `name ${i}`);
    }

    // The cap is on names, and a recovery point doesn't take one
    await expect(saveRecoveryPoint(DOC, OFFLINE, editorState('new content')))
      .resolves.toBeUndefined();
    expect(listLocalVersions(DOC)[0]!.content).toBe(editorState('new content'));
  });

  it('reports the refusal code on a write error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'too many', code: 'too-many-names' }, 409),
    );

    await expect(saveRecoveryPoint(DOC, TOKEN, editorState('x')))
      .rejects.toMatchObject({ code: 'too-many-names' });
    expect(new VersionWriteError('x', 'no-room').code).toBe('no-room');
  });
});
