// PDF export Web Worker — runs off the main thread to prevent UI freeze.
// Receives serialized editor state and document title, returns a PDF blob URL.

import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import { DocumentPDF } from '../components/DocumentPDF';

export interface PdfExportRequest {
  type: 'export';
  editorStateJSON: string;
  title: string;
  watermark?: string;
}

export interface PdfExportResponse {
  type: 'success' | 'error';
  blobUrl?: string;
  error?: string;
}

self.addEventListener('message', async (event: MessageEvent<PdfExportRequest>) => {
  const { type, editorStateJSON, title, watermark } = event.data;

  if (type !== 'export') return;

  try {
    const editorState = JSON.parse(editorStateJSON) as object;
    const element = createElement(DocumentPDF, { editorState, title, watermark });
    const blob = await pdf(element).toBlob();
    const blobUrl = URL.createObjectURL(blob);

    const response: PdfExportResponse = { type: 'success', blobUrl };
    self.postMessage(response);
  } catch (err) {
    const response: PdfExportResponse = {
      type: 'error',
      error: err instanceof Error ? err.message : 'PDF export failed',
    };
    self.postMessage(response);
  }
});
