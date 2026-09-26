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

async function imageParagraph(src: string): Promise<Paragraph | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    return new Paragraph({
      children: [new ImageRun({ data, transformation: { width: 480, height: 320 }, type: 'png' })],
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

/** Builds the .docx for a document's blocks, titled with the document title */
export async function renderDocx(blocks: Block[], title: string): Promise<Blob> {
  const body: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title || 'Untitled' })], alignment: AlignmentType.LEFT }),
  ];
  for (const block of blocks) body.push(...(await elementFor(block)));

  const doc = new Document({
    title: title || 'Untitled',
    numbering: {
      config: [
        { reference: BULLET_REFERENCE, levels: [0, 1, 2, 3, 4].map((level) => ({ level, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } })) },
        { reference: NUMBER_REFERENCE, levels: [0, 1, 2, 3, 4].map((level) => ({ level, format: 'decimal', text: `%${level + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } } })) },
      ],
    },
    sections: [{ children: body }],
  });

  return Packer.toBlob(doc);
}
