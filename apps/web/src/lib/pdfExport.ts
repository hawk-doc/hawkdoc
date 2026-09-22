import { createElement } from 'react';
import type { EditorState } from 'lexical';

// @react-pdf/renderer and its dependencies (pdfkit, fontkit, yoga, …) are
// most of the app's JavaScript, but they're only needed when someone exports.
// Load them on demand so they stay out of the initial bundle.
function importPdfRenderer() {
  return Promise.all([import('@react-pdf/renderer'), import('../components/DocumentPDF')]);
}

let rendererPromise: ReturnType<typeof importPdfRenderer> | null = null;

// Shared between preload and export so the chunk is only fetched once.
// Cleared on failure so a network error can be retried.
function loadPdfRenderer(): ReturnType<typeof importPdfRenderer> {
  rendererPromise ??= importPdfRenderer().catch((err: unknown) => {
    rendererPromise = null;
    throw err;
  });
  return rendererPromise;
}

/**
 * Start downloading the PDF renderer before it's needed — call on signs of
 * intent (hovering or focusing Export) so the first export doesn't wait on
 * the network.
 */
export function preloadPdfExport(): void {
  loadPdfRenderer().catch(() => { /* retried by exportPdf */ });
}

/** Render the document to PDF and download it. Runs on the main thread. */
export async function exportPdf(editorState: EditorState, title: string): Promise<void> {
  const [{ pdf }, { DocumentPDF }] = await loadPdfRenderer();
  const element = createElement(DocumentPDF, {
    editorState: editorState.toJSON(),
    title,
    watermark: 'HawkDoc',
  });
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'document'}.pdf`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
