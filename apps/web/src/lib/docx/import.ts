import mammoth from 'mammoth';

/** Word files above this are refused rather than freezing the tab */
export const MAX_DOCX_BYTES = 10 * 1024 * 1024;

export class DocxImportError extends Error {}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Converts a .docx to HTML. Word's own markup is far richer than the editor's
 * model, so mammoth maps the styles that matter to plain HTML and drops the
 * rest — the same trade-off Lexical's HTML import makes on the other side.
 */
export async function docxToHtml(file: File): Promise<string> {
  if (file.size > MAX_DOCX_BYTES) {
    throw new DocxImportError(`That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is ${MAX_DOCX_BYTES / 1024 / 1024}MB.`);
  }
  // .doc is a different (binary) format that mammoth can't read
  if (file.type && file.type !== DOCX_MIME && !file.name.toLowerCase().endsWith('.docx')) {
    throw new DocxImportError('That file is not a .docx. Word 97-2003 documents (.doc) need converting first.');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
          "p[style-name='Code'] => pre:fresh",
        ],
      },
    );
    return value;
  } catch (err) {
    throw new DocxImportError(
      err instanceof Error && /zip|corrupt|end of central directory/i.test(err.message)
        ? "That file doesn't look like a readable .docx."
        : 'Could not read that Word document.',
    );
  }
}
