import { useEffect, useRef, useState } from 'react';
import type { EditorState } from 'lexical';
import { STORAGE_KEY, DEBOUNCE_MS } from '../constants/autosave';
import type { AutoSaveData } from '../types/editor';

export function loadAutoSave(): AutoSaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoSaveData;
  } catch {
    return null;
  }
}

export function useAutoSave(
  editorState: EditorState | null,
  title: string,
): boolean {
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editorState) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setIsSaving(true);
      try {
        const data: AutoSaveData = {
          title,
          content: JSON.stringify(editorState.toJSON()),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // ignore storage errors
      }
      // localStorage is synchronous — delay the flip so React renders "Saving…" first
      setTimeout(() => setIsSaving(false), 600);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editorState, title]);

  return isSaving;
}
