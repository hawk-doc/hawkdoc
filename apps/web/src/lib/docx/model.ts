import type { EditorRoot } from '../../components/DocumentPDF';

/**
 * An intermediate document model between Lexical's serialised state and a
 * .docx file. Keeping it separate means the mapping — which is where the
 * detail lives — can be tested without generating a document.
 */

/** Lexical's text format bitmask */
const FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
  subscript: 32,
  superscript: 64,
} as const;

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  /** Set when the run came from a link */
  href?: string;
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'listItem'; ordered: boolean; level: number; runs: Run[] }
  | { kind: 'code'; text: string }
  | { kind: 'divider' }
  | { kind: 'pageBreak' }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'table'; rows: { cells: { runs: Run[]; header: boolean }[] }[] };

interface LexicalNode {
  type: string;
  tag?: string;
  listType?: string;
  children?: LexicalNode[];
  text?: string;
  format?: number | string;
  src?: string;
  altText?: string;
  alt?: string;
  variableName?: string;
  headerState?: number;
  url?: string;
}

function formatsOf(format: number | undefined): Omit<Run, 'text'> {
  if (!format) return {};
  const flags: Omit<Run, 'text'> = {};
  if (format & FORMAT.bold) flags.bold = true;
  if (format & FORMAT.italic) flags.italic = true;
  if (format & FORMAT.underline) flags.underline = true;
  if (format & FORMAT.strikethrough) flags.strikethrough = true;
  if (format & FORMAT.code) flags.code = true;
  if (format & FORMAT.subscript) flags.subscript = true;
  if (format & FORMAT.superscript) flags.superscript = true;
  return flags;
}

/** Collects the runs inside a block, preserving inline formatting and links */
export function runsOf(node: LexicalNode, href?: string): Run[] {
  if (node.type === 'text') {
    const text = node.text ?? '';
    if (!text) return [];
    return [{ text, ...formatsOf(typeof node.format === 'number' ? node.format : undefined), ...(href ? { href } : {}) }];
  }

  // Template variables export as their placeholder, the way they read on screen
  if (node.type === 'template-variable') {
    return [{ text: `{{${node.variableName ?? ''}}}`, ...(href ? { href } : {}) }];
  }

  if (node.type === 'linebreak') return [{ text: '\n' }];

  const linkHref = node.type === 'link' || node.type === 'autolink' ? node.url ?? href : href;
  return (node.children ?? []).flatMap((child) => runsOf(child, linkHref));
}

function headingLevel(tag: string | undefined): 1 | 2 | 3 {
  if (tag === 'h2') return 2;
  if (tag === 'h3') return 3;
  return 1;
}

function listItemsOf(node: LexicalNode, ordered: boolean, level: number): Block[] {
  return (node.children ?? []).flatMap<Block>((item) => {
    // A nested list arrives as a child of its list item
    const nested = (item.children ?? []).filter((c) => c.type === 'list');
    const ownRuns = runsOf({ ...item, children: (item.children ?? []).filter((c) => c.type !== 'list') });
    const blocks: Block[] = ownRuns.length ? [{ kind: 'listItem', ordered, level, runs: ownRuns }] : [];
    for (const child of nested) {
      blocks.push(...listItemsOf(child, child.listType === 'number', level + 1));
    }
    return blocks;
  });
}

function tableOf(node: LexicalNode): Block {
  return {
    kind: 'table',
    rows: (node.children ?? []).map((row) => ({
      cells: (row.children ?? []).map((cell) => ({
        runs: runsOf(cell),
        header: (cell.headerState ?? 0) > 0,
      })),
    })),
  };
}

function blockOf(node: LexicalNode): Block[] {
  switch (node.type) {
    case 'heading':
      return [{ kind: 'heading', level: headingLevel(node.tag), runs: runsOf(node) }];
    case 'quote':
      return [{ kind: 'quote', runs: runsOf(node) }];
    case 'list':
      return listItemsOf(node, node.listType === 'number', 0);
    case 'code':
      return [{ kind: 'code', text: runsOf(node).map((r) => r.text).join('') }];
    case 'horizontalrule':
      return [{ kind: 'divider' }];
    case 'page-break':
      return [{ kind: 'pageBreak' }];
    case 'image':
      return node.src ? [{ kind: 'image', src: node.src, alt: node.altText ?? node.alt ?? '' }] : [];
    case 'table':
      return [tableOf(node)];
    case 'paragraph':
      return [{ kind: 'paragraph', runs: runsOf(node) }];
    default:
      // Unknown block: keep its text rather than dropping the content
      return [{ kind: 'paragraph', runs: runsOf(node) }];
  }
}

/** Flattens Lexical's serialised state into blocks ready for a .docx file */
export function toBlocks(state: EditorRoot): Block[] {
  return (state.root.children as LexicalNode[]).flatMap(blockOf);
}
