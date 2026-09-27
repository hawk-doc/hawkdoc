import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SerializedEditorState } from 'lexical';
import { fetchVersions, fetchVersionContent, type DocVersion } from '../lib/versionApi';

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
  open: boolean,
): DocumentVersionsState {
  const [picked, setPicked] = useState<string | null>(null);

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

  const select = useCallback((versionId: string) => { setPicked(versionId); }, []);

  return {
    versions,
    isLoading: list.isPending && open,
    error: list.error,
    selectedId,
    select,
    preview: content.data ?? null,
    isPreviewLoading: content.isPending && selectedId !== null && open,
    previewError: content.error,
  };
}
