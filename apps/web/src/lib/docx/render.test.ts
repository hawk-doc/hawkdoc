import { describe, it, expect } from 'vitest';
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
  return { document: await read('word/document.xml'), rels: await read('word/_rels/document.xml.rels') };
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
