import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { EditorState } from 'lexical';
import { DOC_KEY_PREFIX, DEBOUNCE_MS } from '../constants/autosave';
import { saveDocContent } from '../lib/documentApi';
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

export function useAutoSave(
  editorState: EditorState | null,
  title: string,
  docId: string,
): boolean {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: AutoSaveData) => saveDocContent(docId, data),
  });

  useEffect(() => {
    if (!editorState) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const data: AutoSaveData = { title, content: JSON.stringify(editorState.toJSON()) };
      saveMutation.mutate(data);
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState, title, docId]);

  return saveMutation.isPending;
}
