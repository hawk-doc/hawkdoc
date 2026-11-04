import { useEffect } from 'react';

const APP_NAME = 'HawkDoc';

/** Shows the open document's title in the browser tab, e.g. "Notes — HawkDoc". Restores the default on unmount. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    const previous = document.title;
    const trimmed = title?.trim();
    if (trimmed) document.title = `${trimmed} — ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
