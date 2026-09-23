import { useEffect, useRef, useState } from 'react';
import { FilePlus, FileText, Search, Trash2, X } from 'lucide-react';
import type { DocMeta } from '../interfaces';

interface SidebarProps {
  docs: DocMeta[];
  activeId: string;
  onActivate: (id: string) => void;
  onCreate: () => void | Promise<void>;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Below `md` the sidebar is an overlay drawer that starts closed */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ docs, activeId, onActivate, onCreate, onRename, onDelete, open, onClose }: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

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

      <aside
        className={`sidebar fixed bottom-0 left-0 top-[52px] z-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      <div className="sidebar-header">
        <span className="text-xs font-semibold uppercase tracking-widest text-notion-muted dark:text-[#5f6368]">
          Documents{!isEmptyState && <>&nbsp;·&nbsp;{docs.length}</>}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" title="New document" onClick={() => { void onCreate(); }} className="sidebar-new-btn">
            <FilePlus size={15} />
          </button>
          <button type="button" title="Close documents" onClick={onClose} className="sidebar-new-btn md:hidden">
            <X size={15} />
          </button>
        </div>
      </div>

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

      <nav className="flex-1 overflow-y-auto py-1 px-1">
        {isEmptyState ? (
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
    </aside>
    </>
  );
}
