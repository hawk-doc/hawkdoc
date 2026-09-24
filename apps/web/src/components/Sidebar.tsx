import { useEffect, useRef, useState } from 'react';
import { FilePlus, FileText, Search, Trash2, Undo2, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ConfirmDialog } from './ConfirmDialog';

// Tailwind's `md` — above it the sidebar is a static panel, below it a drawer
const MD = '(min-width: 768px)';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** "just now" / "5m ago" / "3h ago" / "2d ago" / a date beyond a week */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(ts).toLocaleDateString();
}
import type { DocMeta } from '../interfaces';

interface SidebarProps {
  docs: DocMeta[];
  activeId: string;
  onActivate: (id: string) => void;
  onCreate: () => void | Promise<void>;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  trashed: DocMeta[];
  trashOpen: boolean;
  onTrashOpenChange: (open: boolean) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onEmptyTrash: () => void;
  /** Below `md` the sidebar is an overlay drawer that starts closed */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  docs, activeId, onActivate, onCreate, onRename, onDelete,
  trashed, trashOpen, onTrashOpenChange, onRestore, onPurge, onEmptyTrash,
  open, onClose,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [query, setQuery] = useState('');
  // { id } confirms one document, 'all' confirms emptying the trash
  const [pendingPurge, setPendingPurge] = useState<DocMeta | 'all' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isDrawer = !useMediaQuery(MD);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // A closed drawer is only moved off-screen, so without `inert` its controls
  // stay in the tab order and keyboard users land on an invisible panel.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.inert = isDrawer && !open;
  }, [isDrawer, open]);

  // Move focus into the drawer when it opens, and back to whatever opened it
  useEffect(() => {
    if (!isDrawer) return;
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [isDrawer, open]);

  // Keep Tab inside the drawer while it's open (it covers the page)
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!isDrawer || !open || e.key !== 'Tab') return;
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

  const startEdit = (doc: DocMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(doc.id);
    setEditValue(doc.title.trim() || 'Untitled');
  };

  const commitEdit = () => {
    if (!editingId) return;
    onRename(editingId, editValue.trim() || 'Untitled');
    setEditingId(null);
  };

  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter((d) => (d.title.trim() || 'Untitled').toLowerCase().includes(q)) : sorted;

  const isEmptyState =
    !q &&
    docs.length === 1 &&
    (!docs[0].title || docs[0].title === 'Untitled');

  return (
    <>
      {/* Backdrop — drawer only exists below md */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 top-[52px] z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {pendingPurge && (
        <ConfirmDialog
          destructive
          title={pendingPurge === 'all' ? 'Empty the trash?' : 'Delete forever?'}
          message={
            pendingPurge === 'all'
              ? `${trashed.length} document${trashed.length === 1 ? '' : 's'} will be deleted permanently. This can't be undone.`
              : `"${pendingPurge.title.trim() || 'Untitled'}" will be deleted permanently. This can't be undone.`
          }
          confirmLabel={pendingPurge === 'all' ? 'Empty trash' : 'Delete forever'}
          onConfirm={() => {
            if (pendingPurge === 'all') onEmptyTrash();
            else onPurge(pendingPurge.id);
            setPendingPurge(null);
          }}
          onCancel={() => setPendingPurge(null)}
        />
      )}

      <aside
        ref={panelRef}
        // Dialog semantics only while it's an overlay; on desktop it's a plain panel
        role={isDrawer ? 'dialog' : undefined}
        aria-modal={isDrawer ? true : undefined}
        aria-label={isDrawer ? 'Documents' : undefined}
        tabIndex={isDrawer ? -1 : undefined}
        onKeyDown={onPanelKeyDown}
        // h-auto so the drawer's height comes from its top/bottom insets; the
        // .sidebar class's h-full would run it past the bottom of the screen
        // and push the trash toggle out of reach.
        className={`sidebar fixed bottom-0 left-0 top-[52px] z-50 h-auto transition-transform duration-200 outline-none md:static md:z-auto md:h-full md:translate-x-0 md:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      <div className="sidebar-header">
        <span className="text-xs font-semibold uppercase tracking-widest text-notion-muted dark:text-[#5f6368]">
          {trashOpen ? <>Trash{trashed.length > 0 && <>&nbsp;·&nbsp;{trashed.length}</>}</> : <>Documents{!isEmptyState && <>&nbsp;·&nbsp;{docs.length}</>}</>}
        </span>
        <div className="flex items-center gap-1">
          {!trashOpen ? (
            <button type="button" title="New document" onClick={() => { void onCreate(); }} className="sidebar-new-btn">
              <FilePlus size={15} />
            </button>
          ) : (
            trashed.length > 0 && (
              <button
                type="button"
                title="Empty trash"
                onClick={() => setPendingPurge('all')}
                className="px-1.5 py-0.5 rounded text-[11px] font-medium text-notion-muted dark:text-[#9aa0a6] hover:bg-notion-hover dark:hover:bg-[#2d2f31] hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                Empty
              </button>
            )
          )}
          <button type="button" title="Close documents" onClick={onClose} className="sidebar-new-btn md:hidden">
            <X size={15} />
          </button>
        </div>
      </div>

      {!trashOpen && (
      <div className="sidebar-search-wrap">
        <Search size={12} className="sidebar-search-icon" />
        <input
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sidebar-search"
        />
      </div>
      )}

      <nav className="flex-1 overflow-y-auto py-1 px-1">
        {trashOpen ? (
          trashed.length === 0 ? (
            <div className="sidebar-empty">
              <Trash2 size={22} className="mb-2 opacity-30" />
              <p className="text-xs font-medium">Trash is empty</p>
              <p className="text-[11px] opacity-60 text-center leading-snug mt-1">
                Deleted documents can be restored from here
              </p>
            </div>
          ) : (
            trashed.map((doc) => (
              <div key={doc.id} className="sidebar-item group">
                <Trash2 size={13} className="flex-shrink-0 opacity-50" />
                <span className="flex-1 truncate">{doc.title.trim() || 'Untitled'}</span>
                {doc.deletedAt && (
                  <span
                    className="flex-shrink-0 text-[10px] text-notion-muted dark:text-[#5f6368] group-hover:hidden"
                    title={`Deleted ${new Date(doc.deletedAt).toLocaleString()}`}
                  >
                    {timeAgo(doc.deletedAt)}
                  </span>
                )}
                <button
                  type="button"
                  title="Restore"
                  aria-label={`Restore ${doc.title.trim() || 'Untitled'}`}
                  onClick={() => onRestore(doc.id)}
                  className="sidebar-delete-btn"
                >
                  <Undo2 size={12} />
                </button>
                <button
                  type="button"
                  title="Delete forever"
                  aria-label={`Delete ${doc.title.trim() || 'Untitled'} forever`}
                  onClick={() => setPendingPurge(doc)}
                  className="sidebar-delete-btn"
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )
        ) : isEmptyState ? (
          <div className="sidebar-empty">
            <FileText size={28} className="mb-2 opacity-30" />
            <p className="text-xs font-medium mb-1">No documents yet</p>
            <p className="text-[11px] opacity-60 text-center leading-snug">
              Click <strong>+</strong> to create your first document
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="sidebar-empty">
            <Search size={22} className="mb-2 opacity-30" />
            <p className="text-xs font-medium">No matches</p>
          </div>
        ) : (
          filtered.map((doc) => {
            const isActive = doc.id === activeId;
            const isEditing = doc.id === editingId;

            return (
              <div
                key={doc.id}
                className={`sidebar-item group ${isActive ? 'active' : ''}`}
                onClick={() => !isEditing && onActivate(doc.id)}
                onDoubleClick={(e) => startEdit(doc, e)}
              >
                <FileText size={13} className="flex-shrink-0 opacity-50" />

                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="sidebar-rename-input"
                  />
                ) : (
                  <span className="flex-1 truncate">{doc.title.trim() || 'Untitled'}</span>
                )}

                {!isEditing && (
                  <button
                    type="button"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                    className="sidebar-delete-btn"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-notion-border dark:border-[#3c4043] p-1">
        <button
          type="button"
          onClick={() => onTrashOpenChange(!trashOpen)}
          aria-pressed={trashOpen}
          title={trashOpen ? 'Back to documents' : 'Trash'}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-notion-muted dark:text-[#9aa0a6] hover:bg-notion-hover dark:hover:bg-[#2d2f31] hover:text-notion-text dark:hover:text-[#e8eaed] transition-colors"
        >
          {trashOpen ? <FileText size={13} /> : <Trash2 size={13} />}
          {trashOpen ? 'Back to documents' : 'Trash'}
          {!trashOpen && trashed.length > 0 && <span className="ml-auto opacity-70">{trashed.length}</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
