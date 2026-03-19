import { createContext } from 'react';

interface DocumentContextValue {
  header: string;
  footer: string;
}

export const DocumentContext = createContext<DocumentContextValue>({
  header: '',
  footer: '',
});
