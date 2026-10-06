import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  createEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type LexicalEditor,
} from 'lexical';
import { useAutoSave, loadDocContent } from './useAutoSave';
import { EDITOR_NODES } from '../constants/editor';
import { DEBOUNCE_MS } from '../constants/autosave';

const DOC_ID = 'doc-autosave';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function makeEditor(): LexicalEditor {
  return createEditor({
    nodes: EDITOR_NODES,
    onError: (error: Error) => { throw error; },
  });
}

/** Replaces the document's text, the way typing a character ends up doing */
function write(editor: LexicalEditor, text: string): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    root.append($createParagraphNode().append($createTextNode(text)));
  }, { discrete: true });
}

/** Counts `toJSON` calls across every editor state — they share a prototype */
function watchSerialization(editor: LexicalEditor) {
  const proto = Object.getPrototypeOf(editor.getEditorState()) as { toJSON: () => unknown };
  return vi.spyOn(proto, 'toJSON');
}

/** Lets the save mutation's promise settle under fake timers */
const settle = () => act(async () => { await Promise.resolve(); });

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAutoSave', () => {
  it('serializes the document once per save, not once per keystroke', async () => {
    const editor = makeEditor();
    const toJSON = watchSerialization(editor);
    renderHook(() => useAutoSave(editor, 'Notes', DOC_ID), { wrapper });

    for (const text of ['h', 'ha', 'haw', 'hawk', 'hawkd', 'hawkdo', 'hawkdoc']) {
      write(editor, text);
    }

    // Serializing a whole document is the expensive part of a save, so none of
    // it may happen while the typing is still going.
    expect(toJSON).not.toHaveBeenCalled();

    tick(DEBOUNCE_MS);
    await settle();

    expect(toJSON).toHaveBeenCalledTimes(1);
    expect(loadDocContent(DOC_ID)?.content).toContain('hawkdoc');
  });

  it('writes the newest content when several edits land in one window', async () => {
    const editor = makeEditor();
    renderHook(() => useAutoSave(editor, 'Notes', DOC_ID), { wrapper });

    write(editor, 'first');
    tick(DEBOUNCE_MS - 1);
    write(editor, 'second');
    tick(DEBOUNCE_MS);
    await settle();

    const saved = loadDocContent(DOC_ID)?.content ?? '';
    expect(saved).toContain('second');
    expect(saved).not.toContain('first');
  });

  it('does not save when the document has not changed', async () => {
    const editor = makeEditor();
    renderHook(() => useAutoSave(editor, 'Notes', DOC_ID), { wrapper });

    // A caret move reports no dirty nodes, so there is nothing to write
    editor.update(() => { $getRoot().selectEnd(); }, { discrete: true });
    tick(DEBOUNCE_MS);
    await settle();

    expect(loadDocContent(DOC_ID)).toBeNull();
  });

  it('saves a renamed title alongside the content', async () => {
    const editor = makeEditor();
    const view = renderHook(
      ({ title }: { title: string }) => useAutoSave(editor, title, DOC_ID),
      { wrapper, initialProps: { title: 'Notes' } },
    );

    write(editor, 'body');
    tick(DEBOUNCE_MS);
    await settle();
    expect(loadDocContent(DOC_ID)?.title).toBe('Notes');

    view.rerender({ title: 'Renamed' });
    tick(DEBOUNCE_MS);
    await settle();
    expect(loadDocContent(DOC_ID)?.title).toBe('Renamed');
  });

  it('flushes an edit that is still waiting when the document is closed', async () => {
    const editor = makeEditor();
    const view = renderHook(() => useAutoSave(editor, 'Notes', DOC_ID), { wrapper });

    write(editor, 'unsaved');
    view.unmount();
    await settle();

    expect(loadDocContent(DOC_ID)?.content).toContain('unsaved');
  });

  it('saves nothing for a collaborative document', async () => {
    const editor = makeEditor();
    renderHook(() => useAutoSave(null, 'Notes', DOC_ID), { wrapper });

    write(editor, 'synced through yjs');
    tick(DEBOUNCE_MS);
    await settle();

    expect(loadDocContent(DOC_ID)).toBeNull();
  });
});
