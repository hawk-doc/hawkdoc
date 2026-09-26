import { afterEach, describe, it, expect, vi } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { buildDocument } from './render';
import type { Block } from './model';

/**
 * A .docx is a zip; assertions read the WordprocessingML inside it rather than
 * the packed bytes, so they check what Word will actually see.
 */
async function partsOf(blocks: Block[], title = 'Doc') {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(await buildDocument(blocks, title)));
  const read = async (path: string) => (await zip.file(path)?.async('string')) ?? '';
  return { document: await read('word/document.xml'), rels: await read('word/_rels/document.xml.rels'), zip };
}

const xmlFor = async (blocks: Block[], title = 'Doc') => (await partsOf(blocks, title)).document;

describe('docx output', () => {
  it('puts the document title at the top', async () => {
    const xml = await xmlFor([], 'Quarterly plan');
    expect(xml).toContain('Quarterly plan');
    expect(xml).toContain('w:val="Title"');
  });

  it('uses Word heading styles', async () => {
    const xml = await xmlFor([
      { kind: 'heading', level: 1, runs: [{ text: 'One' }] },
      { kind: 'heading', level: 2, runs: [{ text: 'Two' }] },
      { kind: 'heading', level: 3, runs: [{ text: 'Three' }] },
    ]);
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('w:val="Heading3"');
  });

  it('carries inline formatting into runs', async () => {
    const xml = await xmlFor([{
      kind: 'paragraph',
      runs: [
        { text: 'b', bold: true },
        { text: 'i', italic: true },
        { text: 'u', underline: true },
        { text: 's', strikethrough: true },
        { text: 'c', code: true },
      ],
    }]);
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('<w:u ');
    expect(xml).toContain('<w:strike/>');
    expect(xml).toContain('Courier New');
  });

  it('writes links as hyperlinks pointing at the URL', async () => {
    const { document, rels } = await partsOf([{ kind: 'paragraph', runs: [{ text: 'docs', href: 'https://example.test/x' }] }]);
    expect(document).toContain('<w:hyperlink');
    expect(rels).toContain('https://example.test/x');
  });

  it('numbers ordered lists and bullets unordered ones', async () => {
    const xml = await xmlFor([
      { kind: 'listItem', ordered: false, level: 0, runs: [{ text: 'bullet' }] },
      { kind: 'listItem', ordered: true, level: 0, runs: [{ text: 'number' }] },
      { kind: 'listItem', ordered: true, level: 1, runs: [{ text: 'nested' }] },
    ]);
    expect((xml.match(/<w:numPr>/g) ?? []).length).toBe(3);
    expect(xml).toContain('<w:ilvl w:val="1"');
  });

  it('keeps code block lines as separate paragraphs', async () => {
    const xml = await xmlFor([{ kind: 'code', text: 'line one\nline two' }]);
    expect(xml).toContain('line one');
    expect(xml).toContain('line two');
    expect((xml.match(/Courier New/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('writes a page break', async () => {
    const xml = await xmlFor([{ kind: 'pageBreak' }]);
    expect(xml).toContain('w:type="page"');
  });

  it('writes tables with shaded header cells', async () => {
    const xml = await xmlFor([{
      kind: 'table',
      rows: [{ cells: [
        { runs: [{ text: 'Name' }], header: true },
        { runs: [{ text: 'Value' }], header: false },
      ] }],
    }]);
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('F1F3F4');
    expect(xml).toContain('Name');
  });

  it('skips an image whose source cannot be fetched, keeping the rest', async () => {
    const xml = await xmlFor([
      { kind: 'image', src: 'https://unreachable.invalid/a.png', alt: '' },
      { kind: 'paragraph', runs: [{ text: 'after the image' }] },
    ]);
    expect(xml).toContain('after the image');
  });
});


describe('DOCX images', () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockImage(data: number[], contentType: string, width = 1200, height = 600, fails = false) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': contentType }),
      arrayBuffer: async () => new Uint8Array(data).buffer,
    }));
    const revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn().mockReturnValue('blob:test-image');
      static revokeObjectURL = revoke;
    });
    vi.stubGlobal('Image', class {
      naturalWidth = width;
      naturalHeight = height;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => fails ? this.onerror?.() : this.onload?.());
      }
    });
    return revoke;
  }

  it.each([
    ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ''],
    ['jpg', [0xff, 0xd8, 0xff], 'image/png'],
    ['gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'application/octet-stream'],
    ['bmp', [0x42, 0x4d], ''],
    ['jpg', [1, 2, 3], 'image/jpeg; charset=binary'],
  ])('embeds %s with the correct media extension and bytes', async (type, data, mime) => {
    const revoke = mockImage(data, mime);
    const { document, rels, zip } = await partsOf([{ kind: 'image', src: '/image', alt: '' }]);
    const media = Object.keys(zip.files).find((path) => path.endsWith(`.${type}`));
    expect(media).toBeDefined();
    expect(Array.from(await zip.file(media!)!.async('uint8array'))).toEqual(data);
    expect(rels).toContain(`.${type}`);
    // 1200 x 600 fits into 480 x 240; Word uses 9525 EMUs per pixel.
    expect(document).toContain('<wp:extent cx="4572000" cy="2286000"');
    expect(revoke).toHaveBeenCalledWith('blob:test-image');
  });

  it.each([
    [300, 900, 1016000, 3048000],
    [100, 100, 952500, 952500],
  ])('preserves proportions for a %s x %s image without upscaling', async (width, height, cx, cy) => {
    mockImage([0xff, 0xd8, 0xff], '', width, height);
    expect(await xmlFor([{ kind: 'image', src: '/image', alt: '' }]))
      .toContain(`<wp:extent cx="${cx}" cy="${cy}"`);
  });

  it.each([
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'image/png'],
    [[1, 2, 3], 'image/webp'],
    [[1, 2, 3], 'application/octet-stream'],
  ])('skips unsupported images and keeps subsequent content', async (data, mime) => {
    mockImage(data, mime);
    const xml = await xmlFor([
      { kind: 'image', src: '/image', alt: '' },
      { kind: 'paragraph', runs: [{ text: 'remaining content' }] },
    ]);
    expect(xml).not.toContain('<w:drawing>');
    expect(xml).toContain('remaining content');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('skips undecodable images and releases their object URLs', async () => {
    const revoke = mockImage([0xff, 0xd8, 0xff], '', 0, 0, true);
    expect(await xmlFor([{ kind: 'image', src: '/image', alt: '' }])).not.toContain('<w:drawing>');
    expect(revoke).toHaveBeenCalledWith('blob:test-image');
  });
});
