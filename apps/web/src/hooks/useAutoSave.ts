import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { EditorState, LexicalEditor } from 'lexical';
import { DOC_KEY_PREFIX, DEBOUNCE_MS } from '../constants/autosave';
import { saveDocContent } from '../lib/documentApi';
import { recordLocalVersion } from '../lib/versions/localVersions';
import type { AutoSaveData } from '../interfaces';

export function loadDocContent(docId: string): AutoSaveData | null {
  try {
    const raw = localStorage.getItem(`${DOC_KEY_PREFIX}${docId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as Record<string, unknown>).content !== 'string'
    ) return null;
    return parsed as AutoSaveData;
  } catch {
    return null;
  }
}

/**
 * Saves the document a while after typing stops.
 *
 * It takes the editor rather than its state so that keystrokes never reach
 * React: the hook subscribes to Lexical itself, holds the newest state in a
 * ref and only re-renders its caller when a save starts or finishes.
 * Serializing is deferred with it — `toJSON` walks the whole document, which
 * is far too much work to repeat for every character typed when all but the
 * last result is thrown away.
 *
 * Pass `null` for the editor to turn saving off, as collaborative documents
 * do: there Hocuspocus persists the document server-side.
 */
export function useAutoSave(
  editor: LexicalEditor | null,
  title: string,
  docId: string,
): boolean {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lexical's editor states are immutable, so holding the newest one costs a
  // reference and nothing more.
  const stateRef = useRef<EditorState | null>(null);
  // Something has changed since the last write and is waiting to be saved.
  const pendingRef = useRef(false);

  const titleRef = useRef(title);
  titleRef.current = title;

  const saveMutation = useMutation({
    mutationFn: async (data: AutoSaveData) => {
      await saveDocContent(docId, data);
      // Offline documents keep their own history; the snapshot is throttled
      // inside recordLocalVersion, not taken on every save.
      recordLocalVersion(docId, data.content);
    },
  });

  // Held in a ref so the subscription below is registered once, instead of
  // being torn down and rebuilt whenever the mutation's identity changes.
  const saveRef = useRef(saveMutation.mutate);
  saveRef.current = saveMutation.mutate;

  /** Cancels the debounce timer and submits pending content with the latest title. */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const state = stateRef.current;
    if (!pendingRef.current || !state) return;
    pendingRef.current = false;
    saveRef.current({ title: titleRef.current, content: JSON.stringify(state.toJSON()) });
  }, []);

  /** Marks the document as pending and restarts the save debounce timer. */
  const schedule = useCallback(() => {
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
  }, [flush]);

  useEffect(() => {
    if (!editor) return;
    stateRef.current = editor.getEditorState();
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      stateRef.current = editorState;
      // Moving the caret leaves the document identical, so there is nothing to
      // write — without this, clicking around a document saves it repeatedly.
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      schedule();
    });
  }, [editor, schedule]);

  // The title is saved in the same record as the content, so renaming the
  // document has to schedule a write of its own.
  const savedTitleRef = useRef(title);
  useEffect(() => {
    if (title === savedTitleRef.current) return;
    savedTitleRef.current = title;
    if (editor) schedule();
  }, [title, editor, schedule]);

  // Don't drop an edit that is still waiting when the document is switched or
  // the editor unmounts.
  useEffect(() => flush, [flush]);

  return saveMutation.isPending;
}
