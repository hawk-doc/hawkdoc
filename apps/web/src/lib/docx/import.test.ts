import { describe, it, expect, vi } from 'vitest';
import mammoth from 'mammoth';
import { docxToHtml, DocxImportError } from './import';

vi.mock('mammoth', () => ({ default: { convertToHtml: vi.fn() } }));

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('DOCX file type validation', () => {
  it.each(['notes.txt', 'old.doc', 'document'])('rejects %s with an empty MIME type before reading it', async (name) => {
    const file = new File(['content'], name);
    const read = vi.fn();
    Object.defineProperty(file, 'arrayBuffer', { value: read });
    await expect(docxToHtml(file)).rejects.toThrow(DocxImportError);
    await expect(docxToHtml(file)).rejects.toThrow('That file is not a .docx.');
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ['document.DOCX', ''],
    ['document.docx', 'application/octet-stream'],
    ['document', DOCX_MIME],
  ])('accepts %s with MIME type %s', async (name, type) => {
    const file = new File(['content'], name, { type });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(0) });
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({ value: '<p>Imported</p>', messages: [] });
    await expect(docxToHtml(file)).resolves.toBe('<p>Imported</p>');
  });
});
