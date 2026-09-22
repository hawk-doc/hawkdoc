import { createElement } from 'react';
import type { EditorState } from 'lexical';

// @react-pdf/renderer and its dependencies (pdfkit, fontkit, yoga, …) are
// most of the app's JavaScript, but they're only needed when someone exports.
// Load them on demand so they stay out of the initial bundle.
function loadPdfRenderer() {
  return Promise.all([import('@react-pdf/renderer'), import('../components/DocumentPDF')]);
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
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
