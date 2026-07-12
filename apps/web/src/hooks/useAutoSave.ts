import { useEffect, useRef, useState } from 'react';
import type { EditorState } from 'lexical';
import { DOC_KEY_PREFIX, DEBOUNCE_MS } from '../constants/autosave';
import type { AutoSaveData } from '../types/editor';

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

export function useAutoSave(
  editorState: EditorState | null,
  title: string,
  docId: string,
): boolean {
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editorState) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setIsSaving(true);
      try {
        const data: AutoSaveData = { title, content: JSON.stringify(editorState.toJSON()) };
        localStorage.setItem(`${DOC_KEY_PREFIX}${docId}`, JSON.stringify(data));
      } catch { /* ignore storage errors */ }
      setTimeout(() => setIsSaving(false), 600);
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [editorState, title, docId]);

  return isSaving;
}
