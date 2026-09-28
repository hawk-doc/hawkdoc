import type { SerializedEditorState, SerializedElementNode, SerializedLexicalNode } from 'lexical';

/**
 * Compares two editor states so the history panel can show what changed
 * between them, not just what one of them held.
 *
 * The comparison is structural rather than textual: a document is flattened
 * into blocks (a paragraph, a list item, a table row), blocks are matched
 * against each other, and blocks that survived in an edited form are compared
 * again word by word. Diffing the serialised JSON or the plain text would
 * report a moved paragraph as a deletion and an insertion.
 */

export type BlockKind =
  | 'paragraph' | 'heading' | 'list-item' | 'quote' | 'code'
  | 'image' | 'table-row' | 'divider' | 'page-break' | 'other';

export type ChangeStatus = 'added' | 'removed' | 'changed' | 'unchanged';

/** A stretch of text within a block, and what happened to it */
export interface DiffRun {
  text: string;
  status: 'added' | 'removed' | 'unchanged';
}

export interface DiffBlock {
  key: string;
  kind: BlockKind;
  /** What to call this block in the UI when its text doesn't say, e.g. "H2" */
  label: string | null;
  /** Set only when an edited block's label changed too, e.g. H2 became H1 */
  labelAfter: string | null;
  status: ChangeStatus;
  runs: DiffRun[];
}

export interface VersionDiff {
  blocks: DiffBlock[];
  added: number;
  removed: number;
  changed: number;
  isIdentical: boolean;
  /** One of the documents was too long to compare in full */
  truncated: boolean;
}

/**
 * Matching is quadratic in the number of blocks, so very long documents are
 * compared up to this point and reported as truncated. A document this long
 * is far past what the editor's A4 page is for.
 */
export const MAX_BLOCKS = 800;

/** Above this, a block is reported as replaced rather than diffed word by word */
const MAX_TOKENS = 600;

/** How alike two blocks must be to count as one block that was edited */
const SIMILARITY_THRESHOLD = 0.5;

/** Beyond this many candidate pairings, blocks are matched by position */
const MAX_PAIRINGS = 400;

interface Block {
  kind: BlockKind;
  label: string | null;
  text: string;
}

function kindOf(type: string): BlockKind {
  switch (type) {
    case 'heading': return 'heading';
    case 'listitem': return 'list-item';
    case 'quote': return 'quote';
    case 'code': return 'code';
    case 'image': return 'image';
    case 'tablerow': return 'table-row';
    case 'horizontalrule': return 'divider';
    case 'page-break': return 'page-break';
    case 'paragraph': return 'paragraph';
    default: return 'other';
  }
}

interface MaybeText extends SerializedLexicalNode {
  text?: string;
  variableName?: string;
  alt?: string;
  src?: string;
  tag?: string;
  children?: SerializedLexicalNode[];
}

/** The text a node contributes, with a stand-in for what isn't text */
function textOf(node: SerializedLexicalNode): string {
  const candidate = node as MaybeText;
  switch (node.type) {
    case 'text': return candidate.text ?? '';
    // Variables read as their placeholder, which is how they look in the editor
    case 'template-variable': return `{{${candidate.variableName ?? ''}}}`;
    case 'image': return candidate.alt?.trim() ? `Image: ${candidate.alt}` : 'Image';
    case 'horizontalrule': return 'Divider';
    case 'page-break': return 'Page break';
    case 'linebreak': return ' ';
    default:
      return (candidate.children ?? []).map(textOf).join('');
  }
}

function isContainer(type: string): boolean {
  return type === 'list' || type === 'table' || type === 'tablecell';
}

/**
 * Flatten a document into the blocks a reader would recognise. Lists and
 * tables are containers, so their items and rows become the blocks instead —
 * otherwise adding one bullet reads as the whole list changing.
 */
function toBlocks(state: SerializedEditorState): Block[] {
  const blocks: Block[] = [];

  const visit = (node: SerializedLexicalNode): void => {
    if (blocks.length >= MAX_BLOCKS) return;

    if (isContainer(node.type)) {
      for (const child of (node as SerializedElementNode).children ?? []) visit(child);
      return;
    }

    if (node.type === 'tablerow') {
      const cells = ((node as SerializedElementNode).children ?? []).map(textOf);
      blocks.push({ kind: 'table-row', label: 'Table row', text: cells.join(' | ') });
      return;
    }

    // A list item holding a nested list carries no text of its own
    const nested = ((node as SerializedElementNode).children ?? []).filter((child) =>
      isContainer(child.type),
    );
    const text = textOf(node);
    if (text.trim() || nested.length === 0) {
      blocks.push({ kind: kindOf(node.type), label: labelFor(node), text });
    }
    for (const child of nested) visit(child);
  };

  for (const child of (state.root as SerializedElementNode | undefined)?.children ?? []) {
    visit(child);
  }
  return blocks;
}

function labelFor(node: SerializedLexicalNode): string | null {
  const tag = (node as MaybeText).tag;
  switch (node.type) {
    case 'heading': return tag ? tag.toUpperCase() : 'Heading';
    case 'quote': return 'Quote';
    case 'code': return 'Code';
    case 'image': return 'Image';
    case 'horizontalrule': return 'Divider';
    case 'page-break': return 'Page break';
    default: return null;
  }
}

/** Trailing whitespace travels with its word, so runs rebuild the original text */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The indexes of the longest common subsequence of `a` and `b`.
 *
 * A typed table keeps the memory flat for the block counts this allows, and
 * the walk back produces the matched pairs in order.
 */
function commonSubsequence<T>(
  a: T[],
  b: T[],
  same: (left: T, right: T) => boolean,
): Array<[number, number]> {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Int32Array(rows * cols);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = same(a[i]!, b[j]!)
        ? table[(i + 1) * cols + j + 1]! + 1
        : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i]!, b[j]!)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

interface WordComparison {
  runs: DiffRun[];
  /** 0 when the two texts share nothing, 1 when they are the same */
  similarity: number;
}

function compareWords(before: string, after: string): WordComparison {
  const left = tokenize(before);
  const right = tokenize(after);

  if (left.length === 0 && right.length === 0) {
    return { runs: [], similarity: 1 };
  }

  // Comparing two very long blocks word by word costs more than it explains
  if (left.length > MAX_TOKENS || right.length > MAX_TOKENS) {
    return {
      runs: [
        { text: before, status: 'removed' },
        { text: after, status: 'added' },
      ],
      similarity: normalize(before) === normalize(after) ? 1 : 0,
    };
  }

  const pairs = commonSubsequence(left, right, (x, y) => x.trim() === y.trim());
  const runs: DiffRun[] = [];
  const push = (text: string, status: DiffRun['status']): void => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last?.status === status) last.text += text;
    else runs.push({ text, status });
  };

  let i = 0;
  let j = 0;
  for (const [ai, bj] of pairs) {
    while (i < ai) push(left[i++]!, 'removed');
    while (j < bj) push(right[j++]!, 'added');
    push(right[j]!, 'unchanged');
    i++;
    j++;
  }
  while (i < left.length) push(left[i++]!, 'removed');
  while (j < right.length) push(right[j++]!, 'added');

  const similarity = (2 * pairs.length) / (left.length + right.length);
  return { runs, similarity };
}

function blockKey(block: Block): string {
  // The label carries a heading's level, so promoting H2 to H1 is a change
  // even though every word stayed where it was.
  return `${block.kind}\u0000${block.label ?? ''}\u0000${normalize(block.text)}`;
}

function unchangedBlock(block: Block, index: number): DiffBlock {
  return {
    key: `u${index}`,
    kind: block.kind,
    label: block.label,
    labelAfter: null,
    status: 'unchanged',
    runs: block.text ? [{ text: block.text, status: 'unchanged' }] : [],
  };
}

function wholeBlock(block: Block, status: 'added' | 'removed', index: number): DiffBlock {
  return {
    key: `${status[0]}${index}`,
    kind: block.kind,
    label: block.label,
    labelAfter: null,
    status,
    runs: block.text ? [{ text: block.text, status }] : [],
  };
}

/**
 * Blocks that fall between two matches. Ones that are alike enough are reported
 * as a single edited block — otherwise moving a word would read as a paragraph
 * deleted and another one written.
 */
function diffGap(
  removed: Block[],
  added: Block[],
  offset: number,
): DiffBlock[] {
  if (removed.length === 0) return added.map((block, i) => wholeBlock(block, 'added', offset + i));
  if (added.length === 0) return removed.map((block, i) => wholeBlock(block, 'removed', offset + i));

  const byPosition = removed.length * added.length > MAX_PAIRINGS;
  const takenAdded = new Set<number>();
  const result: DiffBlock[] = [];

  removed.forEach((before, index) => {
    let bestIndex = -1;
    let best: WordComparison | null = null;

    const candidates = byPosition ? [index] : added.map((_, i) => i);
    for (const candidate of candidates) {
      const after = added[candidate];
      if (!after || takenAdded.has(candidate) || after.kind !== before.kind) continue;
      const comparison = compareWords(before.text, after.text);
      if (comparison.similarity > (best?.similarity ?? SIMILARITY_THRESHOLD)) {
        best = comparison;
        bestIndex = candidate;
      }
    }

    if (best && bestIndex >= 0) {
      takenAdded.add(bestIndex);
      const after = added[bestIndex]!;
      result.push({
        key: `c${offset + index}`,
        kind: before.kind,
        label: before.label,
        labelAfter: after.label === before.label ? null : after.label,
        status: 'changed',
        runs: best.runs,
      });
    } else {
      result.push(wholeBlock(before, 'removed', offset + index));
    }
  });

  added.forEach((block, index) => {
    if (!takenAdded.has(index)) {
      result.push(wholeBlock(block, 'added', offset + removed.length + index));
    }
  });

  return result;
}

/** What changed between two editor states, block by block */
export function diffEditorStates(
  before: SerializedEditorState,
  after: SerializedEditorState,
): VersionDiff {
  const left = toBlocks(before);
  const right = toBlocks(after);
  const truncated = left.length >= MAX_BLOCKS || right.length >= MAX_BLOCKS;

  const matches = commonSubsequence(left, right, (a, b) => blockKey(a) === blockKey(b));

  const blocks: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  for (const [ai, bj] of matches) {
    if (i < ai || j < bj) {
      blocks.push(...diffGap(left.slice(i, ai), right.slice(j, bj), blocks.length));
      i = ai;
      j = bj;
    }
    blocks.push(unchangedBlock(right[bj]!, blocks.length));
    i++;
    j++;
  }
  if (i < left.length || j < right.length) {
    blocks.push(...diffGap(left.slice(i), right.slice(j), blocks.length));
  }

  const counted = (status: ChangeStatus) => blocks.filter((block) => block.status === status).length;
  const added = counted('added');
  const removed = counted('removed');
  const changed = counted('changed');

  return {
    blocks,
    added,
    removed,
    changed,
    isIdentical: added + removed + changed === 0,
    truncated,
  };
}
