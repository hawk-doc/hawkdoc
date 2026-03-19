import type { LexicalEditor } from 'lexical';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'quote' | 'code';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
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

export interface EditorToolbarProps {
  editor: LexicalEditor;
  onExportPDF: () => void;
  isSaving: boolean;
  title: string;
}
