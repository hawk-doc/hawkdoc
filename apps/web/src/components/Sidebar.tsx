import { useEffect, useRef, useState } from 'react';
import { FilePlus, FileText, Trash2 } from 'lucide-react';
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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="text-xs font-semibold uppercase tracking-widest text-notion-muted dark:text-[#5f6368]">
          Documents
        </span>
        <button type="button" title="New document" onClick={onCreate} className="sidebar-new-btn">
          <FilePlus size={15} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1 px-1">
        {sorted.map((doc) => {
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
        })}
      </nav>
    </aside>
  );
}
