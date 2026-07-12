import { useEffect, useRef, useState } from 'react';
import { FilePlus, FileText, Search, Trash2 } from 'lucide-react';
import type { DocMeta } from '../types/editor';

interface SidebarProps {
  docs: DocMeta[];
  activeId: string;
  onActivate: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ docs, activeId, onActivate, onCreate, onRename, onDelete }: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const startEdit = (doc: DocMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(doc.id);
    setEditValue(doc.title || 'Untitled');
  };

  const commitEdit = () => {
    if (!editingId) return;
    onRename(editingId, editValue.trim() || 'Untitled');
    setEditingId(null);
  };

  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter((d) => (d.title || 'Untitled').toLowerCase().includes(q)) : sorted;

  const isEmptyState =
    !q &&
    docs.length === 1 &&
    (!docs[0].title || docs[0].title === 'Untitled');

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="text-xs font-semibold uppercase tracking-widest text-notion-muted dark:text-[#5f6368]">
          Documents&nbsp;·&nbsp;{docs.length}
        </span>
        <button type="button" title="New document" onClick={onCreate} className="sidebar-new-btn">
          <FilePlus size={15} />
        </button>
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
                  <span className="flex-1 truncate">{doc.title || 'Untitled'}</span>
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
  );
}
