import React, { useEffect, useRef, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import type { SerializedEditorState } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ConfirmDialog } from './ConfirmDialog';
import { useDocumentVersions } from '../hooks/useDocumentVersions';
import { EDITOR_NODES, EDITOR_THEME } from '../constants/editor';
import { groupVersionsByDay, versionAge, versionTime } from '../lib/versions/format';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface VersionHistoryPanelProps {
  docId: string;
  token: string | null;
  open: boolean;
  onClose: () => void;
  /** Hands the chosen version's content back to the editor to apply */
  onRestore: (state: SerializedEditorState) => void;
}

/** The selected version, rendered by the editor itself so it looks exactly right */
function VersionPreview({ state, versionId }: { state: SerializedEditorState; versionId: string }) {
  return (
    <LexicalComposer
      // A new composer per version: the preview is read-only, so there is
      // nothing to carry over from the one before it.
      key={versionId}
      initialConfig={{
        namespace: 'HawkDoc',
        theme: EDITOR_THEME,
        nodes: EDITOR_NODES,
        editable: false,
        editorState: JSON.stringify(state),
        onError: (error: Error) => { console.error('Version preview error:', error); },
      }}
    >
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="editor-content focus:outline-none"
            ariaLabel="Version preview"
          />
        }
        placeholder={
          <div className="editor-placeholder">This version is empty.</div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
}

export function VersionHistoryPanel({
  docId, token, open, onClose, onRestore,
}: VersionHistoryPanelProps) {
  const {
    versions, isLoading, error,
    selectedId, select,
    preview, isPreviewLoading, previewError,
  } = useDocumentVersions(docId, token, open);
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // The panel is only moved off-screen when closed, so without `inert` its
  // controls stay in the tab order.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.inert = !open;
  }, [open]);

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  // Keep Tab inside the panel while it covers the document
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!open || e.key !== 'Tab') return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const selected = versions.find((version) => version.id === selectedId);
  const canRestore = preview !== null && !isPreviewLoading;

  return (
    <>
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 top-[52px] z-40 bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {confirming && selected && preview && (
        <ConfirmDialog
          title="Restore this version?"
          message={`The document will go back to how it was at ${versionTime(selected.createdAt)}. Nothing is lost — the current text becomes part of the history, and you can undo the restore.`}
          confirmLabel="Restore"
          onConfirm={() => {
            setConfirming(false);
            onRestore(preview);
            onClose();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}

      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="Version history"
        onKeyDown={onPanelKeyDown}
        className={`fixed bottom-0 right-0 top-[52px] z-50 flex w-full flex-col bg-white outline-none transition-transform duration-200 dark:bg-[#202020] sm:w-[420px] sm:border-l sm:border-notion-border sm:shadow-2xl dark:sm:border-[#3c4043] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex flex-shrink-0 items-center justify-between border-b border-notion-border px-4 py-3 dark:border-[#3c4043]">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-notion-text dark:text-[#e8eaed]">
            <History size={16} />
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-notion-muted transition-colors hover:bg-notion-hover hover:text-notion-text dark:text-[#9aa0a6] dark:hover:bg-[#2d2f31] dark:hover:text-[#e8eaed]"
          >
            <X size={16} />
          </button>
        </header>

        {/* Version list */}
        <div className="max-h-[40%] flex-shrink-0 overflow-y-auto border-b border-notion-border px-2 py-2 dark:border-[#3c4043]">
          {isLoading && (
            <p className="px-2 py-3 text-[13px] text-notion-muted dark:text-[#9aa0a6]">
              Loading history…
            </p>
          )}

          {error && (
            <p role="alert" className="px-2 py-3 text-[13px] text-red-600 dark:text-red-400">
              {error.message}
            </p>
          )}

          {!isLoading && !error && versions.length === 0 && (
            <p className="px-2 py-3 text-[13px] leading-relaxed text-notion-muted dark:text-[#9aa0a6]">
              No versions yet. One is kept every few minutes as you edit
              {token ? ', and whenever you close the document' : ', in this browser'}.
            </p>
          )}

          {groupVersionsByDay(versions).map(({ day, versions: dayVersions }) => (
            <div key={day}>
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-notion-muted dark:text-[#5f6368]">
                {day}
              </p>
              {dayVersions.map((version) => {
                const isSelected = version.id === selectedId;
                const isNewest = version.id === versions[0]?.id;
                const age = versionAge(version.createdAt);
                const meta = isNewest ? ['latest', age].filter(Boolean).join(' · ') : age;
                return (
                  <button
                    key={version.id}
                    type="button"
                    aria-current={isSelected}
                    onClick={() => select(version.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${
                      isSelected
                        ? 'bg-notion-text text-white dark:bg-[#e8eaed] dark:text-[#202020]'
                        : 'text-notion-text hover:bg-notion-hover dark:text-[#e8eaed] dark:hover:bg-[#2d2f31]'
                    }`}
                  >
                    <span>{versionTime(version.createdAt)}</span>
                    {meta && (
                      <span
                        className={
                          isSelected
                            ? 'text-[11px] opacity-70'
                            : 'text-[11px] text-notion-muted dark:text-[#5f6368]'
                        }
                      >
                        {meta}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Preview of the selected version */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isPreviewLoading && (
            <p className="text-[13px] text-notion-muted dark:text-[#9aa0a6]">Reading this version…</p>
          )}
          {previewError && (
            <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
              {previewError.message}
            </p>
          )}
          {preview && selectedId && !isPreviewLoading && (
            <VersionPreview state={preview} versionId={selectedId} />
          )}
        </div>

        {/* Restore */}
        {versions.length > 0 && (
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-notion-border px-4 py-3 dark:border-[#3c4043]">
            <p className="text-[11px] leading-snug text-notion-muted dark:text-[#5f6368]">
              Restoring can be undone.
            </p>
            <button
              type="button"
              disabled={!canRestore}
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 rounded-lg bg-notion-text px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:bg-opacity-80 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#e8eaed] dark:text-[#202020] dark:hover:bg-white"
            >
              <RotateCcw size={13} />
              Restore this version
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
