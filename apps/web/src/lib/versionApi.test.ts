import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type SerializedElementNode,
  type SerializedTextNode,
} from 'lexical';
import { fetchVersions, fetchVersionContent } from './versionApi';
import { UnauthorizedError } from './documentApi';
import { recordLocalVersion, LOCAL_VERSION_INTERVAL_MS } from './versions/localVersions';
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
      { id: 'v2', createdAt: Date.parse('2026-09-27T10:30:00.000Z') },
      { id: 'v1', createdAt: Date.parse('2026-09-27T10:00:00.000Z') },
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
    recordLocalVersion(DOC, JSON.stringify({ root: { children: [] } }), start);
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
    recordLocalVersion(DOC, JSON.stringify({ root: { children: [] } }), Date.now());

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
