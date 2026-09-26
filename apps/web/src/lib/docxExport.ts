import type { EditorState } from 'lexical';
import type { EditorRoot } from '../components/DocumentPDF';
import { toBlocks } from './docx/model';

// The `docx` library is only needed when someone exports, so it stays out of
// the initial bundle — same treatment as the PDF renderer.
function importDocxRenderer() {
  return import('./docx/render');
}

let rendererPromise: ReturnType<typeof importDocxRenderer> | null = null;

// Shared between preload and export so the chunk is fetched once, and cleared
// on failure so a network error can be retried.
function loadDocxRenderer(): ReturnType<typeof importDocxRenderer> {
  rendererPromise ??= importDocxRenderer().catch((err: unknown) => {
    rendererPromise = null;
    throw err;
  });
  return rendererPromise;
}

/** Start fetching the .docx renderer on signs of intent (hovering Export) */
export function preloadDocxExport(): void {
  loadDocxRenderer().catch(() => { /* retried by exportDocx */ });
}

/** Write the document to a .docx file and download it */
export async function exportDocx(editorState: EditorState, title: string): Promise<void> {
  const { renderDocx } = await loadDocxRenderer();
  const blocks = toBlocks(editorState.toJSON() as unknown as EditorRoot);
  const blob = await renderDocx(blocks, title);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'document'}.docx`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
