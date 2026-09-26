import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { Block, Run } from './model';

const HEADINGS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

/** Word's built-in list styles, referenced by the list blocks below */
const BULLET_REFERENCE = 'hawkdoc-bullets';
const NUMBER_REFERENCE = 'hawkdoc-numbers';

function textRuns(runs: Run[]): (TextRun | ExternalHyperlink)[] {
  return runs.map((run) => {
    const child = new TextRun({
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      underline: run.underline ? {} : undefined,
      strike: run.strikethrough,
      subScript: run.subscript,
      superScript: run.superscript,
      ...(run.code ? { font: 'Courier New' } : {}),
    });
    // A link is a run wrapped in a hyperlink, not a run property
    return run.href ? new ExternalHyperlink({ children: [child], link: run.href }) : child;
  });
}

type ImageType = 'png' | 'jpg' | 'gif' | 'bmp';

function imageType(data: ArrayBuffer, contentType: string | null): ImageType | null {
  const bytes = new Uint8Array(data);
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'jpg';
  if (startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) return 'gif';
  if (startsWith(0x42, 0x4d)) return 'bmp';
  // Word/docx cannot embed WebP, even if a server labels it as PNG.
  if (startsWith(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return null;
  switch (contentType?.split(';')[0].trim().toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/bmp': return 'bmp';
    default: return null;
  }
}

async function imageDimensions(data: ArrayBuffer, type: ImageType): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(new Blob([data], { type: `image/${type === 'jpg' ? 'jpeg' : type}` }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not decode image'));
      image.src = url;
    });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width <= 0 || height <= 0) throw new Error('Invalid image dimensions');
    const scale = Math.min(1, 480 / width, 320 / height);
    return { width: width * scale, height: height * scale };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageParagraph(src: string): Promise<Paragraph | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    const type = imageType(data, res.headers.get('Content-Type'));
    if (!type) return null;
    const transformation = await imageDimensions(data, type);
    return new Paragraph({
      children: [new ImageRun({ data, transformation, type })],
      spacing: { before: 120, after: 120 },
    });
  } catch {
    // An image that can't be fetched shouldn't fail the whole export
    return null;
  }
}

function tableFor(block: Extract<Block, { kind: 'table' }>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: block.rows.map((row) => new TableRow({
      children: row.cells.map((cell) => new TableCell({
        children: [new Paragraph({ children: textRuns(cell.runs.map((r) => ({ ...r, bold: r.bold ?? cell.header }))) })],
        shading: cell.header ? { fill: 'F1F3F4' } : undefined,
      })),
    })),
  });
}

async function elementFor(block: Block): Promise<(Paragraph | Table)[]> {
  switch (block.kind) {
    case 'heading':
      return [new Paragraph({ heading: HEADINGS[block.level], children: textRuns(block.runs) })];
    case 'paragraph':
      return [new Paragraph({ children: textRuns(block.runs), spacing: { after: 120 } })];
    case 'quote':
      return [new Paragraph({
        children: textRuns(block.runs),
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, space: 8, color: 'CCCCCC' } },
        spacing: { after: 120 },
      })];
    case 'listItem':
      return [new Paragraph({
        children: textRuns(block.runs),
        numbering: { reference: block.ordered ? NUMBER_REFERENCE : BULLET_REFERENCE, level: Math.min(block.level, 4) },
      })];
    case 'code':
      // One paragraph per line keeps the line breaks Word expects
      return block.text.split('\n').map((line) => new Paragraph({
        children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
        shading: { fill: 'F6F8FA' },
      }));
    case 'divider':
      return [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: 'D0D0D0' } },
        spacing: { after: 120 },
      })];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'image': {
      const paragraph = await imageParagraph(block.src);
      return paragraph ? [paragraph] : [];
    }
    case 'table':
      return [tableFor(block)];
  }
}

/**
 * Builds the Word document for a set of blocks. Separate from packing it into
 * a file so tests can read the WordprocessingML it produces.
 */
export async function buildDocument(blocks: Block[], title: string): Promise<Document> {
  const body: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title || 'Untitled' })], alignment: AlignmentType.LEFT }),
  ];
  for (const block of blocks) body.push(...(await elementFor(block)));

  return new Document({
    title: title || 'Untitled',
    numbering: {
      config: [
        { reference: BULLET_REFERENCE, levels: [0, 1, 2, 3, 4].map((level) => ({ level, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } })) },
        { reference: NUMBER_REFERENCE, levels: [0, 1, 2, 3, 4].map((level) => ({ level, format: 'decimal', text: `%${level + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } })) },
      ],
    },
    sections: [{ children: body }],
  });
}

/** Packs the document into a .docx file */
export async function renderDocx(blocks: Block[], title: string): Promise<Blob> {
  return Packer.toBlob(await buildDocument(blocks, title));
}
