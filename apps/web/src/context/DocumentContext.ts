import { createContext, useContext } from 'react';
import type { DocumentContextValue } from '../interfaces';

export const DocumentContext = createContext<DocumentContextValue | null>(null);

export function useDocumentContext(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error('useDocumentContext must be used inside DocumentContext.Provider');
  return ctx;
}
