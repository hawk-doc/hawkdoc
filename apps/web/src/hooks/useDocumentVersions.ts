import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SerializedEditorState } from 'lexical';
import {
  fetchVersions,
  fetchVersionContent,
  saveVersion,
  nameVersion,
  type DocVersion,
} from '../lib/versionApi';

export const VERSIONS_QUERY_KEY = 'document-versions';
export const VERSION_CONTENT_QUERY_KEY = 'document-version';

export interface DocumentVersionsState {
  versions: DocVersion[];
  isLoading: boolean;
  error: Error | null;
  /** The version being previewed — the newest until another is picked */
  selectedId: string | null;
  select: (versionId: string) => void;
  preview: SerializedEditorState | null;
  isPreviewLoading: boolean;
  previewError: Error | null;
  /** The version recorded before the selected one, if the history still has it */
  previousId: string | null;
  previous: SerializedEditorState | null;
  isPreviousLoading: boolean;
  previousError: Error | null;
  /** Save a version of the document as it stands, under an optional name */
  save: (label: string | null) => void;
  /** Name a version already in the list, or clear its name with null */
  rename: (versionId: string, label: string | null) => void;
  isWriting: boolean;
  /** Why the last save or rename was refused, for the reader to see */
  writeError: Error | null;
  dismissWriteError: () => void;
}

export interface DocumentVersionsOptions {
  /** The history panel is open; nothing is fetched before it is */
  open: boolean;
  /**
   * The caller is showing a comparison against the version before the selected
   * one. Reading a version costs a Yjs chain rebuild on the server, so that
   * one is only fetched once something is going to show it.
   */
  comparing: boolean;
  /**
   * The document as it stands, serialised. Only needed signed out, where
   * saving a version has no server copy to read from.
   */
  readContent?: () => string | null;
}

/**
 * The versions of a document and the content of the one being previewed.
 * Nothing is fetched until the history is opened, and each version's content
 * is cached once read, so stepping back and forth through a history doesn't
 * rebuild the same version twice.
 */
export function useDocumentVersions(
  docId: string,
  token: string | null,
  { open, comparing, readContent }: DocumentVersionsOptions,
): DocumentVersionsState {
  const [picked, setPicked] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: [VERSIONS_QUERY_KEY, docId, token],
    queryFn: () => fetchVersions(docId, token),
    enabled: open,
    // Versions are recorded while the panel is open, so don't serve a stale list
    staleTime: 0,
  });

  const versions = list.data ?? [];
  // A version the list no longer holds — trimmed at the cap — falls back to the
  // newest rather than leaving the preview stuck on something that is gone.
  const selectedId = versions.some((version) => version.id === picked)
    ? picked
    : versions[0]?.id ?? null;

  const content = useQuery({
    queryKey: [VERSION_CONTENT_QUERY_KEY, docId, selectedId, token],
    queryFn: () => fetchVersionContent(docId, selectedId!, token),
    enabled: open && selectedId !== null,
    // A past version never changes
    staleTime: Infinity,
  });

  // The list runs newest first, so the version before the selected one is the
  // next entry down. Comparing against it is what "changes in this version"
  // means; it shares the content query, so stepping through a history reads
  // each version at most once.
  const selectedIndex = versions.findIndex((version) => version.id === selectedId);
  const previousId = selectedIndex >= 0 ? versions[selectedIndex + 1]?.id ?? null : null;

  const previous = useQuery({
    queryKey: [VERSION_CONTENT_QUERY_KEY, docId, previousId, token],
    queryFn: () => fetchVersionContent(docId, previousId!, token),
    enabled: open && comparing && previousId !== null,
    staleTime: Infinity,
  });

  const select = useCallback((versionId: string) => { setPicked(versionId); }, []);

  // Saving or naming changes the list, and nothing else can tell us how: a new
  // version's place and a rename both come from the server.
  const refreshList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [VERSIONS_QUERY_KEY, docId, token] });
  }, [queryClient, docId, token]);

  const saveMutation = useMutation({
    mutationFn: (label: string | null) =>
      saveVersion(docId, label, token, readContent?.() ?? undefined),
    onSuccess: refreshList,
    onError: (err) => { console.error('Failed to save a version:', err); },
  });

  const renameMutation = useMutation({
    mutationFn: ({ versionId, label }: { versionId: string; label: string | null }) =>
      nameVersion(docId, versionId, label, token),
    onSuccess: refreshList,
    onError: (err) => { console.error('Failed to name a version:', err); },
  });

  const { mutate: writeVersion, reset: resetSave } = saveMutation;
  const { mutate: writeName, reset: resetRename } = renameMutation;

  const save = useCallback((label: string | null) => { writeVersion(label); }, [writeVersion]);
  const rename = useCallback(
    (versionId: string, label: string | null) => { writeName({ versionId, label }); },
    [writeName],
  );
  const dismissWriteError = useCallback(() => {
    resetSave();
    resetRename();
  }, [resetSave, resetRename]);

  return {
    versions,
    isLoading: list.isPending && open,
    error: list.error,
    selectedId,
    select,
    preview: content.data ?? null,
    isPreviewLoading: content.isPending && selectedId !== null && open,
    previewError: content.error,
    previousId,
    previous: previous.data ?? null,
    // isLoading, not isPending: a query that hasn't been enabled yet is
    // pending forever, and that isn't something to show a spinner for.
    isPreviousLoading: previous.isLoading,
    previousError: previous.error,
    save,
    rename,
    isWriting: saveMutation.isPending || renameMutation.isPending,
    writeError: saveMutation.error ?? renameMutation.error,
    dismissWriteError,
  };
}
