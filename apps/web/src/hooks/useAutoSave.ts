import { useEffect, useRef, useState } from 'react';
import type { EditorState } from 'lexical';

const AUTO_SAVE_DELAY_MS = 800;
const STORAGE_KEY = 'hawkdoc_autosave';

interface AutoSaveState {
  content: string;
  title: string;
  savedAt: number;
}

export function useAutoSave(editorState: EditorState | null, title: string): boolean {
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editorState) return;

    setIsSaving(true);

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const state: AutoSaveState = {
          content: JSON.stringify(editorState.toJSON()),
          title,
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // localStorage may be unavailable
      }
      setIsSaving(false);
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [editorState, title]);

  return isSaving;
}

export function loadAutoSave(): AutoSaveState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoSaveState;
  } catch {
    return null;
  }
}
