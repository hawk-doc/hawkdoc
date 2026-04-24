import { createContext, useContext } from 'react';

interface DocumentContextValue {
  header: string;
  footer: string;
}

export const DocumentContext = createContext<DocumentContextValue | null>(null);

export function useDocumentContext(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error('useDocumentContext must be used inside DocumentContext.Provider');
  return ctx;
}
