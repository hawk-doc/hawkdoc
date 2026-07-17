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

export interface AutoSaveData {
  title: string;
  content: string;
}

export interface DocMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface EditorToolbarProps {
  editor: LexicalEditor;
  onExportPDF: () => void;
  isSaving: boolean;
  title: string;
  onToggleFocusMode: () => void;
  collabStatus?: CollabStatus;
}

export type { CollabStatus };
