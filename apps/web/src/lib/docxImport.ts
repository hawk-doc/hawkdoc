import type { LexicalEditor } from 'lexical';
import { $getRoot, $insertNodes, $createParagraphNode } from 'lexical';

// mammoth carries a zip reader and an XML parser, so it loads on demand.
function importDocxReader() {
  return import('./docx/import');
}

let readerPromise: ReturnType<typeof importDocxReader> | null = null;

function loadDocxReader(): ReturnType<typeof importDocxReader> {
  readerPromise ??= importDocxReader().catch((err: unknown) => {
    readerPromise = null;
    throw err;
  });
  return readerPromise;
}

/** Start fetching the reader on signs of intent (hovering Import) */
export function preloadDocxImport(): void {
  loadDocxReader().catch(() => { /* retried by importDocx */ });
}

/**
 * Replaces the document's contents with a Word file's.
 * Returns the title Word had for the document, if it has one worth using.
 */
export async function importDocx(editor: LexicalEditor, file: File): Promise<void> {
  const { docxToHtml } = await loadDocxReader();
  const html = await docxToHtml(file);

  // $generateNodesFromDOM needs the editor's registered nodes, so it runs
  // inside an update rather than on a detached document
  const { $generateNodesFromDOM } = await import('@lexical/html');

  return new Promise<void>((resolve, reject) => {
    editor.update(
      () => {
        try {
          const dom = new DOMParser().parseFromString(html, 'text/html');
          const nodes = $generateNodesFromDOM(editor, dom);
          const root = $getRoot();
          root.clear();
          root.select();
          $insertNodes(nodes);
          // A document that ends on a non-editable block leaves nowhere to type
          if (root.getLastChild()?.getType() !== 'paragraph') {
            root.append($createParagraphNode());
          }
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      { tag: 'docx-import' },
    );
  });
}
