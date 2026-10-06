import type { LexicalEditor } from 'lexical';
import type { CollabStatus } from '../components/CollaborationPlugin';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'code';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  shortcut?: string;
  execute: (editor: LexicalEditor) => void;
}

export interface SlashMenuState {
  query: string;
  anchorRect: DOMRect;
}

/** Which inline formats apply to the current selection */
export interface SelectionFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
}

export interface AutoSaveData {
  title: string;
  content: string;
}

export interface DocMeta {
  id: string;
  title: string;
  updatedAt: number;
  /** When the document was moved to the trash; absent for active documents */
  deletedAt?: number;
}

export interface EditorToolbarProps {
  editor: LexicalEditor;
  onExportPDF: () => void;
  onExportDOCX: () => void;
  onImportDOCX: (file: File) => void;
  onOpenHistory: () => void;
  isSaving: boolean;
  title: string;
  onToggleFocusMode: () => void;
  collabStatus?: CollabStatus;
}

export type { CollabStatus };

export interface DocumentContextValue {
  header: string;
  footer: string;
}
