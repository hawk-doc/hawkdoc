import { describe, it, expect } from 'vitest';
import type { SerializedEditorState } from 'lexical';
import { diffEditorStates, type DiffBlock } from './diff';

/** A document built from shorthand, close enough to Lexical's serialised shape */
function doc(...blocks: unknown[]): SerializedEditorState {
  return {
    root: {
      type: 'root', version: 1, direction: null, format: '', indent: 0,
      children: blocks,
    },
  } as unknown as SerializedEditorState;
}

const text = (value: string) => ({ type: 'text', version: 1, text: value });
const para = (value: string) => ({
  type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
  children: [text(value)],
});
const heading = (tag: string, value: string) => ({
  type: 'heading', version: 1, tag, direction: null, format: '', indent: 0,
  children: [text(value)],
});
const list = (...items: string[]) => ({
  type: 'list', version: 1, listType: 'bullet', direction: null, format: '', indent: 0,
  children: items.map((item) => ({
    type: 'listitem', version: 1, value: 1, direction: null, format: '', indent: 0,
    children: [text(item)],
  })),
});
const image = (alt: string) => ({ type: 'image', version: 1, src: `/uploads/${alt}.png`, alt });

const statuses = (blocks: DiffBlock[]) => blocks.map((block) => block.status);
const texts = (blocks: DiffBlock[]) => blocks.map((block) => block.runs.map((run) => run.text).join(''));
const find = (blocks: DiffBlock[], status: string) => blocks.filter((block) => block.status === status);

describe('diffEditorStates', () => {
  it('reports an untouched document as identical', () => {
    const before = doc(heading('h1', 'Report'), para('Unchanged body.'));
    const diff = diffEditorStates(before, doc(heading('h1', 'Report'), para('Unchanged body.')));

    expect(diff.isIdentical).toBe(true);
    expect(statuses(diff.blocks)).toEqual(['unchanged', 'unchanged']);
  });

  it('marks a deleted paragraph as removed and keeps its text', () => {
    const diff = diffEditorStates(
      doc(para('Keep this.'), para('Delete this.')),
      doc(para('Keep this.')),
    );

    expect(statuses(diff.blocks)).toEqual(['unchanged', 'removed']);
    expect(diff.removed).toBe(1);
    expect(texts(diff.blocks)[1]).toBe('Delete this.');
  });

  it('marks a new paragraph as added', () => {
    const diff = diffEditorStates(doc(para('First.')), doc(para('First.'), para('Second.')));

    expect(statuses(diff.blocks)).toEqual(['unchanged', 'added']);
    expect(diff.added).toBe(1);
  });

  it('reports an edited paragraph as one change, word by word', () => {
    const diff = diffEditorStates(
      doc(para('The quick brown fox jumps over the dog.')),
      doc(para('The quick red fox leaps over the dog.')),
    );

    expect(diff.changed).toBe(1);
    expect(diff.added + diff.removed).toBe(0);

    const runs = diff.blocks[0]!.runs;
    expect(runs.filter((run) => run.status === 'removed').map((run) => run.text.trim()))
      .toEqual(['brown', 'jumps']);
    expect(runs.filter((run) => run.status === 'added').map((run) => run.text.trim()))
      .toEqual(['red', 'leaps']);
    // The unchanged words are still there, so the block reads as a sentence
    expect(runs.map((run) => run.text).join('')).toContain('The quick ');
  });

  it('treats a rewritten paragraph as a removal and an addition, not an edit', () => {
    const diff = diffEditorStates(
      doc(para('Pricing depends on seat count.')),
      doc(para('Nothing whatsoever in common here.')),
    );

    expect(diff.changed).toBe(0);
    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(1);
  });

  it('does not report a moved paragraph as a rewrite of its neighbour', () => {
    const diff = diffEditorStates(
      doc(para('Alpha.'), para('Beta.'), para('Gamma.')),
      doc(para('Beta.'), para('Gamma.'), para('Alpha.')),
    );

    // Alpha moved: one removal and one addition, with the rest left alone
    expect(diff.changed).toBe(0);
    expect(find(diff.blocks, 'unchanged').map((block) => block.runs[0]?.text))
      .toEqual(['Beta.', 'Gamma.']);
  });

  it('compares list items rather than the whole list', () => {
    const diff = diffEditorStates(
      doc(list('one', 'two', 'three')),
      doc(list('one', 'two', 'three', 'four')),
    );

    expect(diff.added).toBe(1);
    expect(statuses(diff.blocks)).toEqual(['unchanged', 'unchanged', 'unchanged', 'added']);
    expect(diff.blocks[3]!.kind).toBe('list-item');
  });

  it('notices a heading that changed level even with the same words', () => {
    const diff = diffEditorStates(doc(heading('h1', 'Summary')), doc(heading('h2', 'Summary')));

    expect(diff.isIdentical).toBe(false);
    expect(diff.changed).toBe(1);
    expect(diff.blocks[0]!.label).toBe('H1');
    expect(diff.blocks[0]!.labelAfter).toBe('H2');
  });

  it('describes blocks that are not text', () => {
    const diff = diffEditorStates(doc(para('Body.')), doc(para('Body.'), image('chart')));

    const added = find(diff.blocks, 'added')[0]!;
    expect(added.kind).toBe('image');
    expect(added.runs[0]!.text).toBe('Image: chart');
  });

  it('reads template variables as their placeholder', () => {
    const variable = {
      type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
      children: [text('Dear '), { type: 'template-variable', version: 1, variableName: 'customer' }],
    };
    const diff = diffEditorStates(doc(para('Dear customer')), doc(variable));

    expect(texts(diff.blocks).join('')).toContain('{{customer}}');
  });

  it('handles an empty document on either side', () => {
    const empty = doc();
    expect(diffEditorStates(empty, empty).isIdentical).toBe(true);
    expect(diffEditorStates(empty, doc(para('New.'))).added).toBe(1);
    expect(diffEditorStates(doc(para('Gone.')), empty).removed).toBe(1);
  });

  it('ignores whitespace-only differences when matching blocks', () => {
    const diff = diffEditorStates(doc(para('Spaced  out')), doc(para('Spaced out')));
    expect(diff.isIdentical).toBe(true);
  });

  it('says when a document was too long to compare in full', () => {
    const many = (count: number, prefix: string) =>
      doc(...Array.from({ length: count }, (_, i) => para(`${prefix} ${i}`)));

    expect(diffEditorStates(many(10, 'line'), many(10, 'line')).truncated).toBe(false);
    expect(diffEditorStates(many(900, 'line'), many(900, 'line')).truncated).toBe(true);
  });

  it('matches a long document instead of rewriting it', () => {
    const before = doc(...Array.from({ length: 300 }, (_, i) => para(`Paragraph number ${i}.`)));
    const after = doc(
      ...Array.from({ length: 300 }, (_, i) => para(i === 150 ? 'Paragraph number edited.' : `Paragraph number ${i}.`)),
    );

    const started = performance.now();
    const diff = diffEditorStates(before, after);
    const elapsed = performance.now() - started;

    // What actually matters, and doesn't depend on the machine: one edit
    // found, and the other 299 paragraphs matched rather than being reported
    // as 299 deletions followed by 299 insertions.
    expect(diff.changed).toBe(1);
    expect(diff.added + diff.removed).toBe(0);
    expect(diff.blocks).toHaveLength(300);

    // A loose smoke bound on top: this runs in tens of milliseconds, so
    // seconds would mean the matching changed shape, not a busy test runner.
    expect(elapsed).toBeLessThan(3_000);
  });
});
