// Shared types and constants used by both frontend and backend

export const MAX_FILE_SIZE_MB = 50;
export const AUTO_SAVE_DELAY_MS = 800;
export const REDIS_FLUSH_INTERVAL_MS = 30_000;

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Document {
  id: string;
  title: string;
  ownerId: string;
  updatedAt: string;
  createdAt: string;
}

export interface DocumentWithState extends Document {
  yjsState: string | null; // base64-encoded Yjs binary state
}

export interface ApiError {
  error: string | Record<string, unknown>;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type BlockType =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'code-block'
  | 'quote'
  | 'divider'
  | 'template-variable';
